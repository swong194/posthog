import re
from datetime import datetime
from random import random
from typing import Any, Dict, Optional

import statsd
from dateutil import parser
from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from posthog.celery import app as celery_app
from posthog.ee import is_ee_enabled
from posthog.helpers.session_recording import preprocess_session_recording_events
from posthog.models import Team, User
from posthog.models.feature_flag import get_active_feature_flags
from posthog.models.utils import UUIDT
from posthog.utils import cors_response, get_ip_address, load_data_from_request

if settings.EE_AVAILABLE:
    from ee.clickhouse.process_event import log_event, process_event_ee
    from ee.kafka_client.topics import KAFKA_EVENTS_PLUGIN_INGESTION, KAFKA_EVENTS_WAL


def _datetime_from_seconds_or_millis(timestamp: str) -> datetime:
    if len(timestamp) > 11:  # assuming milliseconds / update "11" to "12" if year > 5138 (set a reminder!)
        timestamp_number = float(timestamp) / 1000
    else:
        timestamp_number = int(timestamp)

    return datetime.fromtimestamp(timestamp_number, timezone.utc)


def _get_sent_at(data, request) -> Optional[datetime]:
    if request.GET.get("_"):  # posthog-js
        sent_at = request.GET["_"]
    elif isinstance(data, dict) and data.get("sent_at"):  # posthog-android, posthog-ios
        sent_at = data["sent_at"]
    elif request.POST.get("sent_at"):  # when urlencoded body and not JSON (in some test)
        sent_at = request.POST["sent_at"]
    else:
        return None

    if re.match(r"^[0-9]+$", sent_at):
        return _datetime_from_seconds_or_millis(sent_at)

    return parser.isoparse(sent_at)


def _get_token(data, request) -> Optional[str]:
    if request.POST.get("api_key"):
        return request.POST["api_key"]
    if request.POST.get("token"):
        return request.POST["token"]
    if data:
        if isinstance(data, list):
            data = data[0]  # Mixpanel Swift SDK
        if isinstance(data, dict):
            if data.get("$token"):
                return data["$token"]  # JS identify call
            if data.get("token"):
                return data["token"]  # JS reloadFeatures call
            if data.get("api_key"):
                return data["api_key"]  # server-side libraries like posthog-python and posthog-ruby
            if data.get("properties") and data["properties"].get("token"):
                return data["properties"]["token"]  # JS capture call
    return None


def _get_project_id(data, request) -> Optional[int]:
    if request.GET.get("project_id"):
        return int(request.POST["project_id"])
    if request.POST.get("project_id"):
        return int(request.POST["project_id"])
    if data.get("project_id"):
        return int(data["project_id"])
    return None


def _get_distinct_id(data: Dict[str, Any]) -> str:
    try:
        return str(data["$distinct_id"])[0:200]
    except KeyError:
        try:
            return str(data["properties"]["distinct_id"])[0:200]
        except KeyError:
            return str(data["distinct_id"])[0:200]


def _ensure_web_feature_flags_in_properties(event: Dict[str, Any], team: Team, distinct_id: str):
    """If the event comes from web, ensure that it contains property $active_feature_flags."""
    if event["properties"].get("$lib") == "web" and not event["properties"].get("$active_feature_flags"):
        event["properties"]["$active_feature_flags"] = get_active_feature_flags(team, distinct_id)


@csrf_exempt
def get_event(request):
    timer = statsd.Timer("%s_posthog_cloud" % (settings.STATSD_PREFIX,))
    timer.start()
    now = timezone.now()
    try:
        data_from_request = load_data_from_request(request)
        data = data_from_request["data"]
    except TypeError:
        return cors_response(
            request,
            JsonResponse(
                {"code": "validation", "message": "Malformed request data. Make sure you're sending valid JSON.",},
                status=400,
            ),
        )
    if not data:
        return cors_response(
            request,
            JsonResponse(
                {
                    "code": "validation",
                    "message": "No data found. Make sure to use a POST request when sending the payload in the body of the request.",
                },
                status=400,
            ),
        )
    sent_at = _get_sent_at(data, request)

    token = _get_token(data, request)

    if not token:
        return cors_response(
            request,
            JsonResponse(
                {
                    "code": "validation",
                    "message": "API key not provided. You can find your project API key in PostHog project settings.",
                },
                status=401,
            ),
        )
    team = Team.objects.get_team_from_token(token)

    if team is None:
        try:
            project_id = _get_project_id(data, request)
        except:
            return cors_response(
                request, JsonResponse({"code": "validation", "message": "Invalid project ID.",}, status=400,),
            )
        if not project_id:
            return cors_response(
                request,
                JsonResponse(
                    {
                        "code": "validation",
                        "message": "Project API key invalid. You can find your project API key in PostHog project settings.",
                    },
                    status=401,
                ),
            )
        user = User.objects.get_from_personal_api_key(token)
        if user is None:
            return cors_response(
                request, JsonResponse({"code": "validation", "message": "Personal API key invalid.",}, status=401,),
            )
        team = user.teams.get(id=project_id)

    if isinstance(data, dict):
        if data.get("batch"):  # posthog-python and posthog-ruby
            data = data["batch"]
            assert data is not None
        elif "engage" in request.path_info:  # JS identify call
            data["event"] = "$identify"  # make sure it has an event name

    if isinstance(data, list):
        events = data
    else:
        events = [data]

    try:
        events = preprocess_session_recording_events(events)
    except ValueError as e:
        return cors_response(request, JsonResponse({"code": "validation", "message": str(e),}, status=400,),)

    for event in events:
        try:
            distinct_id = _get_distinct_id(event)
        except KeyError:
            return cors_response(
                request,
                JsonResponse(
                    {
                        "code": "validation",
                        "message": "You need to set user distinct ID field `distinct_id`.",
                        "item": event,
                    },
                    status=400,
                ),
            )
        if not event.get("event"):
            return cors_response(
                request,
                JsonResponse(
                    {"code": "validation", "message": "You need to set event name field `event`.", "item": event,},
                    status=400,
                ),
            )

        if not event.get("properties"):
            event["properties"] = {}

        _ensure_web_feature_flags_in_properties(event, team, distinct_id)

        event_uuid = UUIDT()
        ip = None if team.anonymize_ips else get_ip_address(request)

        if is_ee_enabled():
            log_topics = [KAFKA_EVENTS_WAL]

            if settings.PLUGIN_SERVER_INGESTION:
                log_topics.append(KAFKA_EVENTS_PLUGIN_INGESTION)
                statsd.Counter("%s_posthog_cloud_plugin_server_ingestion" % (settings.STATSD_PREFIX,)).increment()

            log_event(
                distinct_id=distinct_id,
                ip=ip,
                site_url=request.build_absolute_uri("/")[:-1],
                data=event,
                team_id=team.id,
                now=now,
                sent_at=sent_at,
                event_uuid=event_uuid,
                topics=log_topics,
            )

            # must done after logging because process_event_ee modifies the event, e.g. by removing $elements
            if not settings.PLUGIN_SERVER_INGESTION:
                process_event_ee(
                    distinct_id=distinct_id,
                    ip=ip,
                    site_url=request.build_absolute_uri("/")[:-1],
                    data=event,
                    team_id=team.id,
                    now=now,
                    sent_at=sent_at,
                    event_uuid=event_uuid,
                )
        else:
            task_name = "posthog.tasks.process_event.process_event"
            if settings.PLUGIN_SERVER_INGESTION or team.plugins_opt_in:
                task_name += "_with_plugins"
                celery_queue = settings.PLUGINS_CELERY_QUEUE
            else:
                celery_queue = settings.CELERY_DEFAULT_QUEUE

            celery_app.send_task(
                name=task_name,
                queue=celery_queue,
                args=[distinct_id, ip, request.build_absolute_uri("/")[:-1], event, team.id, now.isoformat(), sent_at,],
            )
    timer.stop("event_endpoint")
    return cors_response(request, JsonResponse({"status": 1}))
