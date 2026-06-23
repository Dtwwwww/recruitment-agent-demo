"use client";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
      <div className="text-5xl mb-4">🤖</div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">招聘全链路 AI 智能体</h1>
      <p className="text-gray-500 mb-8 max-w-lg">
        从 JD 解析到候选人匹配，从 SABC 评级到面试决策建议——一个平台完成招聘全流程
      </p>
      <div className="flex gap-4">
        <a href="/workflow" className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium">
          🚀 开始招聘流程
        </a>
        <a href="/jobs" className="px-6 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-gray-700">
          📋 职位管理
        </a>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12 text-left max-w-2xl">
        <div className="p-4 rounded-lg bg-blue-50">
          <div className="text-lg mb-1">🔍</div>
          <h3 className="font-semibold text-sm">渠道搜索</h3>
          <p className="text-xs text-gray-500">猎聘，AI 自动搜候选人</p>
        </div>
        <div className="p-4 rounded-lg bg-green-50">
          <div className="text-lg mb-1">📊</div>
          <h3 className="font-semibold text-sm">AI 匹配分析</h3>
          <p className="text-xs text-gray-500">千问大模型逐项比对，SABC评级</p>
        </div>
        <div className="p-4 rounded-lg bg-purple-50">
          <div className="text-lg mb-1">🎯</div>
          <h3 className="font-semibold text-sm">面试决策</h3>
          <p className="text-xs text-gray-500">个性化面试关注点 + 排序推荐</p>
        </div>
      </div>
    </div>
  );
}
