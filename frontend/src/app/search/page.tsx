"use client";

import { useState } from "react";
import { executeSearch, getSearchStatus, getSearchResults, deleteTalent, updateTalent } from "@/lib/api";
import type { TalentListItem, SearchTaskResult } from "@/lib/api";

const CITIES = ["北京","上海","广州","深圳","杭州","成都","南京","武汉","西安","苏州","重庆","长沙","天津","郑州","青岛","合肥","厦门","福州","大连","济南","宁波","无锡","东莞","佛山","珠海","昆明","贵阳","南宁","海口","石家庄","哈尔滨","长春","沈阳","太原","兰州","乌鲁木齐","呼和浩特","银川","西宁","拉萨","南昌"];

export default function SearchPage() {
  const [platform, setPlatform] = useState("liepin");
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("上海");

  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<TalentListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [taskResult, setTaskResult] = useState<SearchTaskResult | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const platformName = platform === "liepin" ? "猎聘" : "BOSS直聘";

  const handleSearch = async () => {
    if (!keywords.trim()) { setError("请输入搜索关键词"); return; }
    setError(null); setCandidates([]); setTaskResult(null);
    setShowLoginModal(true);
  };

  const confirmAndSearch = async () => {
    setShowLoginModal(false);
    setLoading(true);

    try {
      const kw = keywords.split(/[,;\s]+/).filter(Boolean);
      // 启动搜索任务（立即返回 task_id）
      const result = await executeSearch({ platform, keywords: kw, location, max_pages: 5 });
      setTaskResult(result);

      // 轮询等待
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const status = await getSearchStatus(result.task_id);
          setTaskResult(status);
          if (status.status === "completed" || status.status === "failed" || attempts > 60) {
            clearInterval(poll);
            setLoading(false);
            if (status.status === "completed" && status.result_count > 0) {
              const list = await getSearchResults(result.task_id);
              setCandidates(list);
            } else if (status.result_count === 0 && status.status === "completed") {
              setError("搜索完成，但未找到候选人（可能未登录或Cookie过期）");
            } else if (attempts > 60) {
              setError("搜索超时，请重试");
            }
          }
        } catch { clearInterval(poll); setLoading(false); }
      }, 3000);
    } catch (e: any) {
      setError(e.message || "搜索启动失败");
      setLoading(false);
    }
  };

  const cancelSearch = () => { setShowLoginModal(false); };
  const handleDelete = async () => { if (!deletingId) return; try { await deleteTalent(deletingId); setCandidates(prev => prev.filter(c => c.id !== deletingId)); } catch(e){} finally { setDeletingId(null); } };

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold">渠道搜索</h2><p className="text-sm text-gray-500 mt-1">AI 浏览器自动化 · 可视化登录 · 自动入库</p></div>

      {/* 搜索配置 */}
      <div className="card">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium mb-1">平台</label>
            <select className="input-field" value={platform} onChange={e => setPlatform(e.target.value)}>
              <option value="liepin">猎聘</option>
              <option value="bosszhipin">BOSS直聘</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">搜索关键词 <span className="text-gray-400">（逗号/空格分隔）</span></label>
            <input className="input-field" value={keywords} onChange={e => setKeywords(e.target.value)}
              placeholder="Java架构师, 微服务, 金融" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">城市</label>
            <select className="input-field" value={location} onChange={e => setLocation(e.target.value)}>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full" onClick={handleSearch} disabled={loading}>
              {loading ? "⏳ 搜索中..." : `🔍 搜索 ${platformName}`}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>

      {/* ── 登录提示弹窗 ── */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={cancelSearch} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 z-10">
            <h3 className="text-lg font-semibold mb-3">🔐 即将打开 {platformName} 浏览器</h3>
            <div className="text-sm text-gray-600 space-y-2 mb-5">
              <p>AI 浏览器将打开 <b>{platformName}</b>。</p>
              <p>如未登录请<b>扫码登录</b>。登录后请手动设置<b>筛选条件</b>（城市/经验/学历等）。</p>
              <p className="font-medium text-orange-600">在终端按 Enter 后 AI 自动逐人抓取简历详情。</p>
              <p className="text-gray-400 text-xs">Cookie 会保存，下次无需重复登录。</p>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={cancelSearch}>取消</button>
              <button className="btn-primary" onClick={confirmAndSearch}>确认，打开浏览器</button>
            </div>
          </div>
        </div>
      )}

      {/* 任务结果 */}
      {taskResult && (
        <div className="card">
          <h3 className="font-semibold mb-2">📊 搜索完成</h3>
          <div className="flex gap-4 text-sm">
            <span>状态: <b className={taskResult.status === "completed" ? "text-green-600" : "text-red-500"}>{taskResult.status}</b></span>
            <span>找到: <b>{taskResult.result_count}</b> 位候选人</span>
            <span>方法: <b>{taskResult.progress?.method || (taskResult.progress?.pages != null ? taskResult.progress.pages + "页" : "AI浏览器")}</b></span>
          </div>
          {taskResult.progress?.error && (
            <p className="mt-1 text-xs text-orange-600">提示: {taskResult.progress.error}</p>
          )}
        </div>
      )}

      {/* 结果列表 */}
      {candidates.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3">搜索结果（{candidates.length}人，已自动入库）</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2">姓名</th><th className="pb-2">职位</th><th className="pb-2">公司</th>
                  <th className="pb-2">经验</th><th className="pb-2">学历</th><th className="pb-2">来源</th><th className="pb-2 w-16">操作</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(c => (
                  <tr key={c.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="py-2 font-medium">{c.name || "-"}</td>
                    <td className="py-2">{c.current_title || "-"}</td>
                    <td className="py-2">{c.current_company || "-"}</td>
                    <td className="py-2">{c.experience_years ? `${c.experience_years}年` : "-"}</td>
                    <td className="py-2">{c.education || "-"}</td>
                    <td className="py-2 flex items-center gap-1">
                      <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-xs">{c.source_platform}</span>
                      {(c as any).quick_score != null && <span className="text-xs text-purple-600 font-medium">已分析</span>}
                    </td>
                    <td className="py-2">
                      <button className="text-xs text-red-500 hover:text-red-700" onClick={() => setDeletingId(c.id)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/40" onClick={()=>setDeletingId(null)} /><div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 z-10"><h3 className="text-lg font-semibold mb-2">确认删除</h3><p className="text-sm text-gray-600 mb-5">删除后无法恢复</p><div className="flex justify-end gap-2"><button className="btn-secondary text-sm" onClick={()=>setDeletingId(null)}>取消</button><button className="px-4 py-2 bg-red-600 text-white text-sm rounded-md" onClick={handleDelete}>确认删除</button></div></div></div>
      )}
    </div>
  );
}
