"""
Module to centralize event reporting on the server-side.
"""

import posthoganalytics

from posthog.models import Organization, User


def report_user_signed_up(
    distinct_id: str,
    is_instance_first_user: bool,
    is_organization_first_user: bool,
    new_onboarding_enabled: bool = False,
    backend_processor: str = "",  # which serializer/view processed the request
    social_provider: str = "",  # which third-party provider processed the login (empty = no third-party)
) -> None:
    """
    Reports that a new user has joined. Only triggered when a new user is actually created (i.e. when an existing user
    joins a new organization, this event is **not** triggered; see `report_user_joined_organization`).
    """

    props = {
        "is_first_user": is_instance_first_user,
        "is_organization_first_user": is_organization_first_user,
        "new_onboarding_enabled": new_onboarding_enabled,
        "signup_backend_processor": backend_processor,
        "signup_social_provider": social_provider,
    }

    # TODO: This should be $set_once as user props.
    posthoganalytics.identify(distinct_id, props)
    posthoganalytics.capture(distinct_id, "user signed up", properties=props)


def report_user_joined_organization(organization: Organization, current_user: User) -> None:
    """
    Triggered after an already existing user joins an already existing organization.
    """
    posthoganalytics.capture(
        current_user.distinct_id,
        "user joined organization",
        properties={
            "organization_id": str(organization.id),
            "user_number_of_org_membership": current_user.organization_memberships.count(),
            "org_current_invite_count": organization.active_invites.count(),
            "org_current_project_count": organization.teams.count(),
            "org_current_members_count": organization.memberships.count(),
        },
    )


def report_user_logged_in(
    distinct_id: str,
    social_provider: str = "",  # which third-party provider processed the login (empty = no third-party)
) -> None:
    """
    Reports that a user has logged in to PostHog.
    """
    posthoganalytics.capture(distinct_id, "user logged in", properties={"social_provider": social_provider})


def report_onboarding_completed(organization: Organization, current_user: User) -> None:
    """
    Reports that the `new-onboarding-2822` has been completed.
    """

    team_members_count = organization.members.count()

    # TODO: This should be $set_once as user props.
    posthoganalytics.identify(current_user.distinct_id, {"onboarding_completed": True})
    posthoganalytics.capture(
        current_user.distinct_id, "onboarding completed", properties={"team_members_count": team_members_count},
    )


def report_team_member_invited(
    distinct_id: str, name_provided: bool, current_invite_count: int, current_member_count: int, email_available: bool,
) -> None:
    """
    Triggered after a user creates an **individual** invite for a new team member. See `report_bulk_invited`
    for bulk invite creation.
    """
    posthoganalytics.capture(
        distinct_id,
        "team invite executed",
        properties={
            "name_provided": name_provided,
            "current_invite_count": current_invite_count,  # number of invites including this one
            "current_member_count": current_member_count,
            "email_available": email_available,
        },
    )


def report_bulk_invited(
    distinct_id: str,
    invitee_count: int,
    name_count: int,
    current_invite_count: int,
    current_member_count: int,
    email_available: bool,
) -> None:
    """
    Triggered after a user bulk creates invites for another user.
    """
    posthoganalytics.capture(
        distinct_id,
        "bulk invite executed",
        properties={
            "invitee_count": invitee_count,
            "name_count": name_count,
            "current_invite_count": current_invite_count,  # number of invites including this set
            "current_member_count": current_member_count,
            "email_available": email_available,
        },
    )
