import React from 'react'
import './index.scss'
import dayjs from 'dayjs'
import { Col, Popover, Row } from 'antd'
import relativeTime from 'dayjs/plugin/relativeTime'
import LocalizedFormat from 'dayjs/plugin/localizedFormat'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { useValues } from 'kea'
import { teamLogic } from 'scenes/teamLogic'
import { ProjectOutlined, LaptopOutlined, GlobalOutlined, SettingOutlined } from '@ant-design/icons'
import { Link } from '../Link'
import { humanTzOffset, shortTimeZone } from 'lib/utils'

const BASE_OUTPUT_FORMAT = 'ddd, MMM D, YYYY HH:mm'

dayjs.extend(LocalizedFormat)
dayjs.extend(relativeTime)
dayjs.extend(utc)
dayjs.extend(timezone)

function TZConversionHeader(): JSX.Element {
    return (
        <h3 className="l3">
            Timezone conversion
            <span className="float-right">
                <Link to="/project/settings#timezone">
                    <SettingOutlined />
                </Link>
            </span>
        </h3>
    )
}

/** Return a simple label component with timezone conversion UI. */
export function TZLabel({ time, showSeconds }: { time: string | dayjs.Dayjs; showSeconds?: boolean }): JSX.Element {
    const parsedTime = dayjs.isDayjs(time) ? time : dayjs(time)
    const { currentTeam } = useValues(teamLogic)

    const DATE_OUTPUT_FORMAT = !showSeconds ? BASE_OUTPUT_FORMAT : `${BASE_OUTPUT_FORMAT}:ss`
    const timeStyle = showSeconds ? { minWidth: 192 } : undefined

    const PopoverContent = (
        <div className="tz-label-popover">
            <TZConversionHeader />
            <div className="divider" />
            <div className="timezones">
                <Row className="timezone">
                    <Col className="name">
                        <LaptopOutlined /> {shortTimeZone(undefined, parsedTime.toDate())}
                    </Col>
                    <Col className="scope">Your device</Col>
                    <Col className="time" style={timeStyle}>
                        {parsedTime.format(DATE_OUTPUT_FORMAT)}
                    </Col>
                </Row>
                {currentTeam && (
                    <Row className="timezone">
                        <Col className="name">
                            <ProjectOutlined /> {shortTimeZone(currentTeam.timezone, parsedTime.toDate())}
                        </Col>
                        <Col className="scope">Project</Col>
                        <Col className="time" style={timeStyle}>
                            {parsedTime.tz(currentTeam.timezone).format(DATE_OUTPUT_FORMAT)}
                        </Col>
                    </Row>
                )}
                {currentTeam?.timezone !== 'UTC' && (
                    <Row className="timezone">
                        <Col className="name">
                            <GlobalOutlined /> UTC
                        </Col>
                        <Col className="scope" />
                        <Col className="time" style={timeStyle}>
                            {parsedTime.tz('UTC').format(DATE_OUTPUT_FORMAT)}
                        </Col>
                    </Row>
                )}
            </div>
        </div>
    )

    return (
        <Popover content={PopoverContent}>
            <span className="tz-label">{parsedTime.fromNow()}</span>
        </Popover>
    )
}

/** Return an explainer component for analytics visualization pages. */
export function TZIndicator({ style }: { style?: React.CSSProperties }): JSX.Element {
    const { currentTeam } = useValues(teamLogic)
    const PopoverContent = (
        <div className="tz-label-popover">
            <TZConversionHeader />
            <p style={{ maxWidth: 320 }}>
                Times presented in visualizations are UTC.
                <br />
                Conversion of your local timezones to UTC below.
            </p>
            <div className="divider" />
            <div className="timezones">
                <Row className="timezone">
                    <Col className="name">
                        <LaptopOutlined /> {shortTimeZone(undefined)}
                    </Col>
                    <Col className="scope">Your device</Col>
                    <Col className="time" style={{ minWidth: 100, fontWeight: 'bold' }}>
                        {humanTzOffset()}
                    </Col>
                </Row>
                {currentTeam && (
                    <Row className="timezone">
                        <Col className="name">
                            <ProjectOutlined /> {shortTimeZone(currentTeam.timezone)}
                        </Col>
                        <Col className="scope">Project</Col>
                        <Col className="time" style={{ minWidth: 100, fontWeight: 'bold' }}>
                            {humanTzOffset(currentTeam.timezone)}
                        </Col>
                    </Row>
                )}
            </div>
        </div>
    )

    return (
        <Popover content={PopoverContent}>
            <span className="tz-indicator" style={style}>
                <GlobalOutlined /> UTC
            </span>
        </Popover>
    )
}
