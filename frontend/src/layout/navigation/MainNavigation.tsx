import React, { useRef, useState, useEffect, useMemo } from 'react'
import { Layout, Menu, Modal, Popover } from 'antd'
import {
    ProjectFilled,
    ApiFilled,
    ClockCircleFilled,
    DownOutlined,
    MessageOutlined,
    PushpinFilled,
    PlusOutlined,
    SettingOutlined,
} from '@ant-design/icons'
import { useActions, useValues } from 'kea'
import { Link } from 'lib/components/Link'
import { Scene, sceneLogic } from 'scenes/sceneLogic'
import { triggerResizeAfterADelay } from 'lib/utils'
import { useEscapeKey } from 'lib/hooks/useEscapeKey'
import lgLogo from 'public/posthog-logo-white.svg'
import smLogo from 'public/icon-white.svg'
import { hot } from 'react-hot-loader/root'
import './Navigation.scss'
import {
    IconCohorts,
    IconDashboard,
    IconEvents,
    IconFeatureFlags,
    IconInsights,
    IconPerson,
    IconToolbar,
} from 'lib/components/icons'
import { navigationLogic } from './navigationLogic'
import { ToolbarModal } from '~/layout/ToolbarModal/ToolbarModal'
import { dashboardsModel } from '~/models'
import { DashboardType } from '~/types'
import { userLogic } from 'scenes/userLogic'
import { organizationLogic } from 'scenes/organizationLogic'
import posthog from 'posthog-js'

// to show the right page in the sidebar
const sceneOverride: Partial<Record<Scene, string>> = {
    action: 'actions',
    person: 'persons',
    dashboard: 'dashboards',
}

interface MenuItemProps {
    title: string
    icon: JSX.Element
    identifier: string
    to: string
    highlight?: boolean
    onClick?: () => void
}

const MenuItem = ({ title, icon, identifier, to, highlight = false, onClick }: MenuItemProps): JSX.Element => {
    const { scene, loadingScene } = useValues(sceneLogic)
    const { collapseMenu } = useActions(navigationLogic)

    function handleClick(): void {
        onClick?.()
        collapseMenu()
    }

    const className: string = useMemo(() => {
        const nominalScene: Scene = loadingScene || scene
        // Scenes with special handling handled below
        const activeScene: string = sceneOverride[nominalScene] || nominalScene
        const classList = ['menu-item']
        if (identifier === activeScene) {
            classList.push('menu-item-active')
        } else if (highlight) {
            classList.push('menu-item-highlighted')
        }
        return classList.join(' ')
    }, [scene, loadingScene])

    return (
        <Link to={to} onClick={handleClick}>
            <div className={className} data-attr={`menu-item-${identifier}`}>
                {icon}
                <span className="menu-title text-center">{title}</span>
            </div>
        </Link>
    )
}

function PinnedDashboards(): JSX.Element {
    const { pinnedDashboards, dashboards } = useValues(dashboardsModel)
    const { setPinnedDashboardsVisible } = useActions(navigationLogic)

    return (
        <Menu className="pinned-dashboards">
            {dashboards.length ? (
                <>
                    {pinnedDashboards.length && (
                        <Menu.ItemGroup title="Pinned dashboards" key="pinned">
                            {pinnedDashboards.map((item: DashboardType, index: number) => (
                                <Menu.Item key={`pinned-${item.id}`} style={{ margin: 0 }}>
                                    <MenuItem
                                        title={item.name}
                                        icon={<PushpinFilled />}
                                        identifier={`dashboard-${index}`}
                                        to={`/dashboard/${item.id}`}
                                        onClick={() => setPinnedDashboardsVisible(false)}
                                    />
                                </Menu.Item>
                            ))}
                        </Menu.ItemGroup>
                    )}
                    {dashboards.length > pinnedDashboards.length && (
                        <Menu.ItemGroup title="All dashboards" key="all" className="all-dashboard-list">
                            {dashboards
                                .filter((item: DashboardType) => !item.pinned)
                                .map((item: DashboardType) => (
                                    <Menu.Item key={`dashboard-${item.id}`} style={{ margin: 0 }}>
                                        <MenuItem
                                            title={item.name}
                                            icon={<IconDashboard />}
                                            identifier={`dashboard-${item.id}`}
                                            to={`/dashboard/${item.id}`}
                                            onClick={() => setPinnedDashboardsVisible(false)}
                                        />
                                    </Menu.Item>
                                ))}
                        </Menu.ItemGroup>
                    )}
                </>
            ) : (
                <Menu.Item className="text-center" style={{ height: 'initial' }}>
                    <span className="text-muted">You don't have any dashboards yet.</span>
                    <div>
                        <Link
                            to="/dashboard?new"
                            style={{ color: 'var(--primary)' }}
                            data-attr="create-dashboard-pinned-overlay"
                        >
                            <PlusOutlined />
                            Create your first dashboard now
                        </Link>
                    </div>
                </Menu.Item>
            )}
        </Menu>
    )
}

export const MainNavigation = hot(_MainNavigation)
function _MainNavigation(): JSX.Element {
    const { user } = useValues(userLogic)
    const { currentOrganization } = useValues(organizationLogic)
    const { menuCollapsed, toolbarModalOpen, pinnedDashboardsVisible } = useValues(navigationLogic)
    const { setMenuCollapsed, collapseMenu, setToolbarModalOpen, setPinnedDashboardsVisible } = useActions(
        navigationLogic
    )
    const navRef = useRef<HTMLDivElement | null>(null)
    const [canScroll, setCanScroll] = useState(false)

    useEscapeKey(collapseMenu, [menuCollapsed])

    const calcCanScroll = (target: HTMLDivElement | null): boolean => {
        return !!target && target.scrollHeight > target.offsetHeight + target.scrollTop + 60 // 60px of offset tolerance
    }

    const handleNavScroll = (e: React.UIEvent<HTMLDivElement>): void => {
        const target = e.target as HTMLDivElement
        setCanScroll(calcCanScroll(target))
    }

    const scrollToBottom = (): void => {
        navRef.current?.scrollTo(0, navRef.current?.scrollHeight)
    }

    useEffect(() => {
        setCanScroll(calcCanScroll(navRef.current))
    }, [navRef])

    return (
        <>
            <div className={`navigation-mobile-overlay${!menuCollapsed ? ' open' : ''}`} onClick={collapseMenu} />
            <Layout.Sider
                breakpoint="lg"
                collapsedWidth={0}
                width={80}
                collapsed={menuCollapsed}
                trigger={null}
                onCollapse={(collapsed) => {
                    setMenuCollapsed(collapsed)
                    triggerResizeAfterADelay()
                }}
                className="navigation-main"
            >
                <div className="navigation-inner" ref={navRef} onScroll={handleNavScroll}>
                    <div className="nav-logo">
                        <Link to="/insights">
                            <img src={smLogo} className="logo-sm" alt="" />
                            <img src={lgLogo} className="logo-lg" alt="" />
                        </Link>
                    </div>
                    {currentOrganization?.setup.is_active && (
                        <MenuItem title="Setup" icon={<SettingOutlined />} identifier="onboardingSetup" to="/setup" />
                    )}
                    <Popover
                        content={PinnedDashboards}
                        placement="right"
                        trigger="hover"
                        arrowPointAtCenter
                        overlayClassName="pinned-dashboards-popover"
                        onVisibleChange={(visible) => setPinnedDashboardsVisible(visible)}
                        visible={pinnedDashboardsVisible}
                    >
                        <div>
                            <MenuItem
                                title="Dashboards"
                                icon={<IconDashboard />}
                                identifier="dashboards"
                                to="/dashboard"
                                onClick={() => setPinnedDashboardsVisible(false)}
                            />
                        </div>
                    </Popover>
                    <MenuItem
                        title="Insights"
                        icon={<IconInsights />}
                        identifier="insights"
                        to="/insights?insight=TRENDS"
                    />
                    <div className="divider" />
                    <MenuItem title="Events" icon={<IconEvents />} identifier="events" to="/events" />
                    <MenuItem title="Sessions" icon={<ClockCircleFilled />} identifier="sessions" to="/sessions" />
                    <div className="divider" />
                    <MenuItem title="Persons" icon={<IconPerson />} identifier="persons" to="/persons" />
                    <MenuItem title="Cohorts" icon={<IconCohorts />} identifier="cohorts" to="/cohorts" />
                    <div className="divider" />
                    <MenuItem
                        title="Feat. Flags"
                        icon={<IconFeatureFlags />}
                        identifier="featureFlags"
                        to="/feature_flags"
                    />
                    <div className="divider" />
                    {user?.plugin_access.configure ? (
                        <MenuItem
                            title="Plugins"
                            icon={<ApiFilled />}
                            identifier="plugins"
                            to="/project/plugins"
                            highlight={!posthog.persistence.properties()['has_checked_out_plugins']}
                        />
                    ) : null}
                    <MenuItem
                        title="Annotations"
                        icon={<MessageOutlined />}
                        identifier="annotations"
                        to="/annotations"
                    />
                    <MenuItem
                        title="Project"
                        icon={<ProjectFilled />}
                        identifier="projectSettings"
                        to="/project/settings"
                    />
                    <div className="divider" />
                    <MenuItem
                        title="Toolbar"
                        icon={<IconToolbar />}
                        identifier="toolbar"
                        to=""
                        onClick={() => setToolbarModalOpen(true)}
                    />
                    <div className={`scroll-indicator ${canScroll ? '' : 'hide'}`} onClick={scrollToBottom}>
                        <DownOutlined />
                    </div>
                </div>
            </Layout.Sider>

            <Modal
                bodyStyle={{ padding: 0 }}
                visible={toolbarModalOpen}
                footer={null}
                onCancel={() => setToolbarModalOpen(false)}
            >
                <ToolbarModal />
            </Modal>
        </>
    )
}
