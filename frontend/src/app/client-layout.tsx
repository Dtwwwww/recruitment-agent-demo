"use client";

import { usePathname } from "next/navigation";

const NAV = [
  { href: "/workflow", label: "🚀 工作台" },
  { href: "/jobs", label: "职位管理" },
  { href: "/talent", label: "人才库" },
  { href: "/search", label: "渠道搜索" },
  { href: "/candidates", label: "候选人" },
];

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // "/" exact match only, otherwise "/" matches everything with startsWith
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  return (
    <>
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 items-center">
            <div className="flex items-center gap-6">
              <a href="/" className="text-lg font-bold text-primary-700 no-underline">
                🤖 招聘AI智能体
              </a>
              <div className="hidden sm:flex gap-1">
                {NAV.map(item => (
                  <a key={item.href} href={item.href}
                    className={`px-3 py-2 text-sm rounded-md transition-colors ${
                      isActive(item.href)
                        ? "bg-primary-50 text-primary-700 font-medium"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}>
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
            <div className="text-xs text-gray-400">Phase 1 · 猎聘 + BOSS</div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </>
  );
}
