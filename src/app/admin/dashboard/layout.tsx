'use client'

import '@fontsource-variable/inter'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, AppWindow, Plug, Brain, Layers, Route, BookOpen,
  DollarSign, Bot, Database, Palette, FlaskConical, ShieldAlert, Bell,
  FileText, Server, ImageIcon, Video, Mic,
  LogOut, Menu, X, ChevronRight, User, PanelLeftClose, PanelLeft, Settings,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  color: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard, color: 'text-blue-400' },
    ],
  },
  {
    label: 'Apps',
    items: [
      { href: '/admin/dashboard/apps', label: 'All Apps', icon: AppWindow, color: 'text-cyan-400' },
      { href: '/admin/dashboard/apps/new', label: 'Onboarding', icon: Plug, color: 'text-emerald-400' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/admin/dashboard/routing', label: 'Routing', icon: Route, color: 'text-blue-400' },
      { href: '/admin/dashboard/memory', label: 'Memory', icon: Database, color: 'text-cyan-400' },
      { href: '/admin/dashboard/learning', label: 'Learning', icon: BookOpen, color: 'text-emerald-400' },
      { href: '/admin/dashboard/agents', label: 'Agents', icon: Bot, color: 'text-violet-400' },
    ],
  },
  {
    label: 'Media',
    items: [
      { href: '/admin/dashboard/multimodal', label: 'Multimodal', icon: Palette, color: 'text-rose-400' },
      { href: '/admin/dashboard/playground', label: 'Playground', icon: FlaskConical, color: 'text-purple-400' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/admin/dashboard/ai-providers', label: 'Providers', icon: Brain, color: 'text-violet-400' },
      { href: '/admin/dashboard/models', label: 'Models', icon: Layers, color: 'text-orange-400' },
      { href: '/admin/dashboard/budgets', label: 'Budgets', icon: DollarSign, color: 'text-amber-400' },
      { href: '/admin/dashboard/events', label: 'Events', icon: FileText, color: 'text-slate-300' },
      { href: '/admin/dashboard/healing', label: 'Self-Healing', icon: ShieldAlert, color: 'text-lime-400' },
      { href: '/admin/dashboard/alerts', label: 'Alerts', icon: Bell, color: 'text-red-400' },
      { href: '/admin/dashboard/vps', label: 'Monitoring', icon: Server, color: 'text-amber-400' },
    ],
  },
  {
    label: 'Access',
    items: [
      { href: '/admin/dashboard/readiness', label: 'Readiness', icon: Settings, color: 'text-slate-300' },
    ],
  },
]

const allNavItems = navGroups.flatMap((g) => g.items)

/* ─── Sidebar (shared between desktop & mobile) ─── */
function SidebarContent({
  collapsed, onClose, onLogout,
}: {
  collapsed?: boolean
  onClose?: () => void
  onLogout: () => void
}) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className={`border-b border-white/[0.06] ${collapsed ? 'p-3 flex justify-center' : 'p-5'}`}>
        <Link href="/" className="flex items-center gap-2 group" onClick={onClose}>
          {!collapsed ? (
            <span className="text-sm font-bold tracking-tight font-heading whitespace-nowrap">
              <span className="text-white">Amarkt</span>
              <span className="text-blue-500">AI</span>
              <span className="text-white ml-1">Network</span>
            </span>
          ) : (
            <span className="text-sm font-bold tracking-tight font-heading">
              <span className="text-white">A</span>
              <span className="text-blue-500">I</span>
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 pt-3 pb-2 overflow-y-auto" aria-label="Dashboard navigation">
        {navGroups.map((group, gi) => (
          <div key={group.label} className="mb-1">
            {gi > 0 && <div className={`my-2 border-t border-white/[0.04] ${collapsed ? 'mx-1' : 'mx-2'}`} />}
            {!collapsed && (
              <p className="text-[10px] text-slate-500 font-mono tracking-widest uppercase px-3 mb-1 font-semibold">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5" role="list">
              {group.items.map((item) => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    role="listitem"
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`relative flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-lg text-[13px] font-medium transition-all duration-200 group
                      ${active
                        ? 'bg-blue-500/10 text-white border border-blue-500/20'
                        : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                      }`}
                  >
                    <item.icon className={`w-[18px] h-[18px] shrink-0 transition-colors ${active ? item.color : ''}`} />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {active && !collapsed && <ChevronRight className="w-3 h-3 text-blue-400/60" />}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={`border-t border-white/[0.06] ${collapsed ? 'p-2 flex flex-col items-center gap-1' : 'p-3 space-y-1'}`}>
        <button
          onClick={onLogout}
          title="Sign Out"
          className={`flex items-center ${collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2 w-full'} rounded-lg text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-all`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  )
}

/* ─── Main layout ─── */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      const sb = localStorage.getItem('amarktai-sidebar')
      if (sb === 'collapsed') setCollapsed(true)
    } catch { /* SSR / restricted */ }
  }, [])

  const toggleSidebar = useCallback(() => {
    setCollapsed((p) => {
      const next = !p
      try { localStorage.setItem('amarktai-sidebar', next ? 'collapsed' : 'expanded') } catch { /* noop */ }
      return next
    })
  }, [])

  const handleLogout = useCallback(async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
  }, [router])

  const marginL = collapsed ? 'lg:ml-[68px]' : 'lg:ml-64'

  const currentPage = allNavItems.find((n) => n.href === pathname)
  const currentGroup = navGroups.find((g) => g.items.some((i) => i.href === pathname))

  return (
    <div className="min-h-screen bg-[#050810] flex" style={{ fontFamily: "'Inter Variable','Inter',system-ui,-apple-system,sans-serif" }}>
      {/* ── Desktop sidebar ── */}
      <motion.aside
        animate={{ width: collapsed ? 68 : 256 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="hidden lg:flex flex-col bg-[#0a0f1a]/95 backdrop-blur-xl border-r border-white/[0.06] fixed inset-y-0 left-0 z-40 overflow-hidden"
        aria-label="Sidebar"
      >
        <SidebarContent collapsed={collapsed} onLogout={handleLogout} />
      </motion.aside>

      {/* ── Mobile overlay ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <motion.div
              initial={{ x: -264 }}
              animate={{ x: 0 }}
              exit={{ x: -264 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative w-64 bg-[#0a0f1a] border-r border-white/[0.06] flex flex-col"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors z-10"
                aria-label="Close sidebar"
              >
                <X className="w-4 h-4" />
              </button>
              <SidebarContent onClose={() => setMobileOpen(false)} onLogout={handleLogout} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main area ── */}
      <div className={`flex-1 ${marginL} relative z-10 transition-[margin] duration-300`}>
        {/* Top bar */}
        <header className="h-14 border-b border-white/[0.06] bg-[#050810]/80 backdrop-blur-xl flex items-center gap-3 px-4 lg:px-5 sticky top-0 z-30">
          <button className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors" onClick={() => setMobileOpen(true)} aria-label="Open sidebar">
            <Menu className="w-5 h-5" />
          </button>

          <button className="hidden lg:flex p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors" onClick={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm min-w-0">
            {currentGroup && <span className="text-slate-500 font-medium hidden sm:inline truncate">{currentGroup.label}</span>}
            {currentGroup && currentPage && <ChevronRight className="w-3 h-3 text-slate-600 hidden sm:inline shrink-0" />}
            {currentPage && (
              <div className="flex items-center gap-2 min-w-0">
                <currentPage.icon className={`w-4 h-4 shrink-0 ${currentPage.color}`} />
                <span className="font-semibold text-white truncate">{currentPage.label}</span>
              </div>
            )}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white">
              <User className="w-3.5 h-3.5" />
            </div>
            <span className="hidden sm:inline text-xs text-slate-400 font-medium">Admin</span>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="p-4 lg:p-6 max-w-7xl" role="main">
          {children}
        </main>
      </div>
    </div>
  )
}
