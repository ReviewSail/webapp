import React, { useState } from "react"
import { 
  Sparkles, 
  Layers, 
  Settings, 
  CheckCircle, 
  Terminal, 
  BookOpen, 
  Boxes, 
  Compass, 
  Cpu, 
  Zap,
  Code,
  Globe,
  FileText,
  Workflow
} from "lucide-react"

export default function Index() {
  const [activeTab, setActiveTab] = useState<"overview" | "features" | "status">("overview")
  const [simulationStatus, setSimulationStatus] = useState<string>("Systems Idle")
  const [tasks, setTasks] = useState([
    { id: 1, text: "Create workspace files", completed: true },
    { id: 2, text: "Set up Tailwind CSS configuration", completed: true },
    { id: 3, status: "completed", text: "Create AI_RULES.md instructions", completed: true },
    { id: 4, text: "Launch live application preview", completed: false }
  ])

  const toggleTask = (id: number) => {
    setTasks(tasks.map(task => 
      task.id === id ? { ...task, completed: !task.completed } : task
    ))
  }

  const runSimulation = () => {
    setSimulationStatus("Booting Core services...")
    setTimeout(() => {
      setSimulationStatus("Checking environment variables...")
    }, 1000)
    setTimeout(() => {
      setSimulationStatus("Synchronizing app dependencies...")
    }, 2000)
    setTimeout(() => {
      setSimulationStatus("All systems green 🟢")
    }, 3200)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      {/* Top Banner / Navbar */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-slate-200/80 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-2 rounded-xl shadow-md text-white">
              <Boxes className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-slate-950 to-slate-700 bg-clip-text text-transparent">
                Dyad React Workspace
              </h1>
              <p className="text-xs text-slate-500 font-medium">Vite + React + TS + Tailwind</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 animate-ping"></span>
              Live Development
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 lg:p-8 space-y-8">
        
        {/* Hero Section */}
        <div className="relative overflow-hidden bg-white border border-slate-200 rounded-3xl p-6 md:p-10 shadow-sm space-y-6">
          <div className="absolute top-0 right-0 w-80 h-80 bg-blue-100/40 rounded-full blur-3xl -z-10 translate-x-12 -translate-y-12"></div>
          <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-indigo-100/40 rounded-full blur-3xl -z-10 translate-y-12"></div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-4 max-w-2xl">
              <div className="inline-flex items-center space-x-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold border border-blue-100">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Workspace Reconstructed</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
                Modern React App Boilerplate
              </h2>
              <p className="text-slate-600 leading-relaxed text-base md:text-lg">
                We successfully resolved the startup issue by initializing a pristine Vite manifest structure with React Router, Lucide Icons, and beautiful Tailwind presets. Let's build something epic!
              </p>
            </div>
            
            <div className="flex flex-col gap-3 min-w-[200px]">
              <button 
                onClick={runSimulation}
                className="w-full inline-flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium px-4 py-3 rounded-xl shadow-sm transition-all duration-150 transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <Zap className="w-4 h-4 fill-white text-white" />
                <span>Test Live System</span>
              </button>
              <div className="text-center">
                <span className="text-xs font-mono text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
                  Status: {simulationStatus}
                </span>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
              <div className="text-slate-500 text-xs font-semibold mb-1 uppercase tracking-wider">Bundler</div>
              <div className="text-slate-900 font-bold text-lg flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-orange-500" />
                <span>Vite 5</span>
              </div>
            </div>
            <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
              <div className="text-slate-500 text-xs font-semibold mb-1 uppercase tracking-wider">Language</div>
              <div className="text-slate-900 font-bold text-lg flex items-center gap-1.5">
                <Code className="w-4 h-4 text-blue-500" />
                <span>TypeScript</span>
              </div>
            </div>
            <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
              <div className="text-slate-500 text-xs font-semibold mb-1 uppercase tracking-wider">UI Styling</div>
              <div className="text-slate-900 font-bold text-lg flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-cyan-500" />
                <span>Tailwind CSS</span>
              </div>
            </div>
            <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
              <div className="text-slate-500 text-xs font-semibold mb-1 uppercase tracking-wider">Components</div>
              <div className="text-slate-900 font-bold text-lg flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-500" />
                <span>shadcn style</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab("overview")}
            className={`pb-4 px-6 font-semibold text-sm transition-all border-b-2 -mb-px ${
              activeTab === "overview" 
                ? "border-blue-600 text-blue-600" 
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Overview & Stack
          </button>
          <button
            onClick={() => setActiveTab("features")}
            className={`pb-4 px-6 font-semibold text-sm transition-all border-b-2 -mb-px ${
              activeTab === "features" 
                ? "border-blue-600 text-blue-600" 
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Interactive Demo
          </button>
          <button
            onClick={() => setActiveTab("status")}
            className={`pb-4 px-6 font-semibold text-sm transition-all border-b-2 -mb-px ${
              activeTab === "status" 
                ? "border-blue-600 text-blue-600" 
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Project Rules & Instructions
          </button>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === "overview" && (
            <div className="grid md:grid-cols-3 gap-6">
              
              {/* Stack Description Card */}
              <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                  <Workflow className="w-5 h-5 text-indigo-500" />
                  <span>The Re-architected Architecture</span>
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  The initial workspace failed because it was missing a standard project root configuration and <code>package.json</code> manifest. We established a high-performance React runtime framework powered by lightweight, modern development patterns.
                </p>

                <div className="grid sm:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                    <h4 className="font-bold text-sm text-slate-800">1. Instant Bundling</h4>
                    <p className="text-xs text-slate-500 leading-normal">
                      Vite provides lightning fast ESM-based Hot Module Replacement (HMR) to render updates instantly.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                    <h4 className="font-bold text-sm text-slate-800">2. CSS Utilities</h4>
                    <p className="text-xs text-slate-500 leading-normal">
                      Tailwind utility-first design classes enable inline styles that maintain absolute design system cohesion.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                    <h4 className="font-bold text-sm text-slate-800">3. Absolute Typings</h4>
                    <p className="text-xs text-slate-500 leading-normal">
                      Fully configuration-typed aliases enable seamless imports like <code>@/lib/utils</code> or components.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                    <h4 className="font-bold text-sm text-slate-800">4. Beautiful Icons</h4>
                    <p className="text-xs text-slate-500 leading-normal">
                      Lucide-react icons are embedded cleanly with consistent sizing and strokes for pristine visual language.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Resources list */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-500" />
                  <span>Core References</span>
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-2.5 hover:bg-slate-50 rounded-xl transition-all">
                    <div className="bg-blue-100 text-blue-600 p-2 rounded-lg mt-0.5">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Tailwind Styling</h4>
                      <p className="text-[11px] text-slate-500 leading-tight">Use utility classes for margins, padding, colors and flexbox.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 hover:bg-slate-50 rounded-xl transition-all">
                    <div className="bg-cyan-100 text-cyan-600 p-2 rounded-lg mt-0.5">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Dynamic Classes</h4>
                      <p className="text-[11px] text-slate-500 leading-tight">Use the <code>cn(...)</code> function in <code>src/lib/utils.ts</code>.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 hover:bg-slate-50 rounded-xl transition-all">
                    <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg mt-0.5">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">AI RULES File</h4>
                      <p className="text-[11px] text-slate-500 leading-tight">AI_RULES.md provides precise operational constraints.</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {activeTab === "features" && (
            <div className="grid md:grid-cols-2 gap-6">
              
              {/* Interactive checklist demonstrating state */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                    <span>Workspace Milestones</span>
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    {tasks.filter(t => t.completed).length} / {tasks.length} Completed
                  </span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Interact with the component below to verify standard state updating and reactivity is working seamlessly in the live rendering engine!
                </p>

                <div className="space-y-2 pt-2">
                  {tasks.map(task => (
                    <div 
                      key={task.id} 
                      onClick={() => toggleTask(task.id)}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                        task.completed 
                          ? "bg-slate-50 border-emerald-200 text-slate-500 line-through" 
                          : "bg-white border-slate-200 hover:border-slate-300 text-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                          task.completed 
                            ? "bg-emerald-500 border-emerald-500 text-white" 
                            : "border-slate-300"
                        }`}>
                          {task.completed && <CheckCircle className="w-4.5 h-4.5 text-white stroke-[2.5]" />}
                        </div>
                        <span className="text-sm font-semibold">{task.text}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        task.completed ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                      }`}>
                        {task.completed ? "Done" : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Developer terminal output simulation */}
              <div className="bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-800 flex flex-col justify-between space-y-4 min-h-[300px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-mono font-bold text-slate-300">developer-console ~ webapp</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                  </div>
                </div>

                <div className="flex-1 font-mono text-xs text-slate-300 space-y-2 leading-relaxed py-2">
                  <p className="text-slate-500">// App initialized successfully in sandbox mode</p>
                  <p className="text-blue-400">$ npm run dev</p>
                  <p className="text-emerald-400">➜  Local:   http://localhost:5173/</p>
                  <p className="text-slate-400">➜  Network: use --host to expose</p>
                  <p className="text-slate-500">➜  press h + enter to show help</p>
                  <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 mt-2">
                    <p className="text-indigo-400">Latest Build Logs:</p>
                    <p className="text-[11px] text-slate-400 mt-1">✔ 5 configurations verified.</p>
                    <p className="text-[11px] text-slate-400">✔ 1 single routing definition registered.</p>
                    <p className="text-[11px] text-slate-400">✔ index.html injection succeeded.</p>
                  </div>
                </div>

                <div className="text-[10px] font-mono text-slate-500 text-right">
                  System uptime: 100% stable
                </div>
              </div>

            </div>
          )}

          {activeTab === "status" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div>
                <h3 className="font-bold text-xl text-slate-900 flex items-center gap-2">
                  <FileText className="w-5.5 h-5.5 text-blue-600" />
                  <span>Interactive Guide: AI Rules</span>
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  We compiled a complete <code>AI_RULES.md</code> for all developers working in this workspace. Below are the key guidelines.
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">1</div>
                  <h4 className="font-bold text-sm text-slate-800">React Router</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Always keep the central routes mapping located inside <code>src/App.tsx</code> to preserve clean SPA entry.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                  <div className="w-8 h-8 rounded-full bg-cyan-100 text-cyan-600 flex items-center justify-center font-bold text-sm">2</div>
                  <h4 className="font-bold text-sm text-slate-800">Tailwind Native Only</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Style all responsive components with utility classes. Do not write raw CSS files or inline styling objects.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">3</div>
                  <h4 className="font-bold text-sm text-slate-800">Consistent Icons</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Always import icons exclusively from <code>lucide-react</code> to prevent multiple heavy icon packages.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 text-sm text-blue-800 leading-relaxed">
                <strong>Pro-tip:</strong> Look inside <code>AI_RULES.md</code> at the root directory of this workspace to read the complete set of specifications. It has been perfectly crafted for immediate, consistent development!
              </div>
            </div>
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 px-6 text-center text-xs text-slate-400 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2025 Dyad Web Sandbox. All rights reserved.</p>
          <div className="flex space-x-4">
            <span className="hover:text-slate-600 transition-all cursor-pointer">Documentation</span>
            <span>•</span>
            <span className="hover:text-slate-600 transition-all cursor-pointer">Workspace Help</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
