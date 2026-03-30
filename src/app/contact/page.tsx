'use client'

import { useState } from 'react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'

type FormState = 'idle' | 'loading' | 'success' | 'error'
type Tab = 'early-access' | 'inquiry'

const inputCls =
  'w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 transition-all'

export default function ContactPage() {
  const [tab, setTab] = useState<Tab>('early-access')
  const [state, setState] = useState<FormState>('idle')

  const [access, setAccess] = useState({ name: '', email: '', company: '', interest: '' })
  const [inquiry, setInquiry] = useState({ name: '', email: '', message: '' })

  const setA = (k: keyof typeof access) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAccess(f => ({ ...f, [k]: e.target.value }))

  const setI = (k: keyof typeof inquiry) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setInquiry(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState('loading')
    try {
      if (tab === 'early-access') {
        const res = await fetch('/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: access.name,
            email: access.email,
            interest: access.interest || 'All Platforms',
          }),
        })
        if (!res.ok) throw new Error()
      } else {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: inquiry.name,
            email: inquiry.email,
            companyOrProject: '',
            message: inquiry.message,
          }),
        })
        if (!res.ok) throw new Error()
      }
      setState('success')
    } catch {
      setState('error')
    }
  }

  const reset = () => {
    setState('idle')
    setAccess({ name: '', email: '', company: '', interest: '' })
    setInquiry({ name: '', email: '', message: '' })
  }

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <Header />

      {/* Hero */}
      <section className="pt-32 pb-10 px-6 text-center">
        <h1 className="font-heading text-5xl sm:text-6xl font-extrabold tracking-tight mb-4">
          <span className="gradient-text">Request</span> Access
        </h1>
        <p className="text-slate-400 text-lg max-w-lg mx-auto leading-relaxed">
          Join the early access waitlist or send us a message — we respond within 24&nbsp;hours.
        </p>
      </section>

      {/* Form */}
      <section className="px-4 sm:px-6 pb-32">
        <div className="max-w-lg mx-auto">
          {state === 'success' ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-white/[0.03] p-10 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="font-heading text-2xl font-bold mb-2">
                {tab === 'early-access' ? 'You\u2019re on the List' : 'Message Sent'}
              </h2>
              <p className="text-slate-400 text-sm mb-6">
                {tab === 'early-access'
                  ? 'We\u2019ll notify you when early access opens. Keep an eye on your inbox.'
                  : 'We typically respond within 24 hours. Looking forward to connecting.'}
              </p>
              <button onClick={reset} className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                Send another message
              </button>
            </div>
          ) : (
            <>
              {/* Tab toggle */}
              <div className="flex rounded-lg bg-white/[0.04] border border-white/10 p-1 mb-8">
                {([['early-access', 'Early Access'], ['inquiry', 'General Inquiry']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setTab(key); setState('idle') }}
                    className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
                      tab === key
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                        : 'text-slate-500 hover:text-slate-300 border border-transparent'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {tab === 'early-access' ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-500">Full Name *</label>
                        <input required type="text" value={access.name} onChange={setA('name')} placeholder="Your name" className={inputCls} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-500">Email *</label>
                        <input required type="email" value={access.email} onChange={setA('email')} placeholder="you@company.com" className={inputCls} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">Company <span className="text-slate-700">(optional)</span></label>
                      <input type="text" value={access.company} onChange={setA('company')} placeholder="e.g. Acme Corp" className={inputCls} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">Interest Area <span className="text-slate-700">(optional)</span></label>
                      <input type="text" value={access.interest} onChange={setA('interest')} placeholder="e.g. Financial tools, AI analytics" className={inputCls} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-500">Full Name *</label>
                        <input required type="text" value={inquiry.name} onChange={setI('name')} placeholder="Your name" className={inputCls} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-500">Email *</label>
                        <input required type="email" value={inquiry.email} onChange={setI('email')} placeholder="you@company.com" className={inputCls} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">Message *</label>
                      <textarea
                        required
                        rows={5}
                        value={inquiry.message}
                        onChange={setI('message')}
                        placeholder="Tell us what you're working on or looking for..."
                        className={`${inputCls} resize-none`}
                      />
                    </div>
                  </>
                )}

                {state === 'error' && (
                  <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
                    </svg>
                    <span>Something went wrong. Please check your connection and try again.</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={state === 'loading'}
                  className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {state === 'loading' ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : tab === 'early-access' ? (
                    'Join Waitlist'
                  ) : (
                    'Send Message'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
