"use client";

import { useEffect, useState } from "react";

interface Stats {
  jobs: number;
  candidates: number;
  matches: number;
  tasks: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ jobs: 0, candidates: 0, matches: 0, tasks: 0 });
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [jobsRes, candsRes, matchesRes, tasksRes] = await Promise.allSettled([
          fetch("/api/v1/jd/list"),
          fetch("/api/v1/search/candidates"),
          fetch("/api/v1/match/list"),
          fetch("/api/v1/search/tasks"),
        ]);

        const parse = (r: PromiseSettledResult<Response>) =>
          r.status === "fulfilled" && r.value.ok ? r.value.json().catch(() => []) : Promise.resolve([]);

        const jobs = await parse(jobsRes);
        const cands = await parse(candsRes);
        const matches = await parse(matchesRes);
        const tasks = await parse(tasksRes);

        setStats({
          jobs: Array.isArray(jobs) ? jobs.length : 0,
          candidates: Array.isArray(cands) ? cands.length : 0,
          matches: Array.isArray(matches) ? matches.length : 0,
          tasks: Array.isArray(tasks) ? tasks.length : 0,
        });

        if (Array.isArray(tasks)) {
          setRecentTasks(tasks.slice(0, 5));
        }
      } catch {
        // ignore fetch errors
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { pending: "等待中", running: "进行中", completed: "已完成", failed: "失败" };
    return map[s] || s;
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      completed: "bg-green-100 text-green-700", running: "bg-blue-100 text-blue-700",
      failed: "bg-red-100 text-red-700", pending: "bg-gray-100 text-gray-600",
    };
    return map[s] || "bg-gray-100";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">数据看板</h2>
        <p className="text-sm text-gray-500 mt-1">招聘全链路实时数据概览</p>
      </div>

      {/* 核心指标 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "职位总数", value: stats.jobs, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "候选人", value: stats.candidates, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "匹配分析", value: stats.matches, color: "text-green-600", bg: "bg-green-50" },
          { label: "搜索任务", value: stats.tasks, color: "text-orange-600", bg: "bg-orange-50" },
        ].map(item => (
          <div key={item.label} className={`${item.bg} rounded-xl p-5`}>
            <div className="text-sm text-gray-500">{item.label}</div>
            <div className={`text-3xl font-bold mt-1 ${item.color}`}>
              {loading ? <span className="text-gray-300">-</span> : item.value}
            </div>
          </div>
        ))}
      </div>

      {/* 最近任务 */}
      <div className="card">
        <h3 className="font-semibold mb-3">最近搜索任务</h3>
        {recentTasks.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            {loading ? "加载中..." : "暂无数据，去 工作台 创建第一个任务"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">任务</th>
                  <th className="pb-2 font-medium">平台</th>
                  <th className="pb-2 font-medium">状态</th>
                  <th className="pb-2 font-medium">结果数</th>
                  <th className="pb-2 font-medium">时间</th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.map((t: any) => (
                  <tr key={t.id || t.task_id} className="border-b last:border-b-0">
                    <td className="py-2.5 font-mono text-xs">{(t.id || t.task_id || "").substring(0, 8)}</td>
                    <td className="py-2.5">{t.platform || "-"}</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor(t.status)}`}>
                        {statusLabel(t.status)}
                      </span>
                    </td>
                    <td className="py-2.5">{t.result_count ?? "-"}</td>
                    <td className="py-2.5 text-xs text-gray-400">
                      {t.created_at ? new Date(t.created_at).toLocaleDateString("zh-CN") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}