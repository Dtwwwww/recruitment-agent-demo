"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { parseJD, JobRequirement } from "@/lib/api";

interface ReqItem {
  category: string;
  description: string;
  priority: string;
  weight: number;
}

interface SavedJob {
  id: string;
  title: string;
  notes: string;
  coreCount: number;
  importantCount: number;
  bonusCount: number;
  createdAt: string;
}

interface JobModal {
  mode: "add" | "edit";
  id?: string;           // edit 时传 id
  title: string;
  notes: string;
}

const STORAGE_KEY_LIST = "recruit_jobs_list";
const STORAGE_KEY_DATA = "recruit_jobs_data";

function loadLocalJobs(): SavedJob[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LIST);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalJobs(jobs: SavedJob[]) {
  localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(jobs));
}

function saveLocalJobData(id: string, data: JobRequirement) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA) || "{}");
    all[id] = data;
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(all));
  } catch {
    // ignore
  }
}

function syncJobTitle(id: string, title: string) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA) || "{}");
    if (all[id]) {
      all[id].title = title;
      localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(all));
    }
  } catch {
    // ignore
  }
}

export function getLocalJobData(id: string): JobRequirement | null {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA) || "{}");
    return all[id] || null;
  } catch {
    return null;
  }
}

export default function JobsPage() {
  const router = useRouter();
  const [jdText, setJdText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JobRequirement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<SavedJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  // 弹窗状态
  const [modal, setModal] = useState<JobModal | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = () => {
    setJobsLoading(true);
    const local = loadLocalJobs();
    setJobs(local);
    setJobsLoading(false);
  };

  const handleParse = async () => {
    if (!jdText.trim() || jdText.trim().length < 2) {
      setError("请输入职位描述");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await parseJD(jdText);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "解析失败");
    } finally {
      setLoading(false);
    }
  };

  // 点击"添加职位"，弹出填写窗
  const handleOpenAdd = () => {
    if (!result) return;
    setModal({
      mode: "add",
      title: result.title,
      notes: "",
    });
  };

  // 点击编辑按钮
  const handleOpenEdit = (e: React.MouseEvent, job: SavedJob) => {
    e.stopPropagation(); // 阻止行点击跳转
    setModal({
      mode: "edit",
      id: job.id,
      title: job.title,
      notes: job.notes || "",
    });
  };

  // 弹窗确认
  const handleModalConfirm = () => {
    if (!modal || !modal.title.trim()) return;

    if (modal.mode === "add" && result) {
      // 新增
      const saved: SavedJob = {
        id: result.id,
        title: modal.title.trim(),
        notes: modal.notes.trim(),
        coreCount: result.core_requirements?.length || 0,
        importantCount: result.important_requirements?.length || 0,
        bonusCount: result.bonus_requirements?.length || 0,
        createdAt: new Date().toISOString(),
      };
      saveLocalJobData(result.id, result);

      const existing = loadLocalJobs().filter(j => j.id !== saved.id);
      const updated = [saved, ...existing];
      saveLocalJobs(updated);
      setJobs(updated);
      setResult(null);
      setJdText("");
    } else if (modal.mode === "edit" && modal.id) {
      // 编辑列表
      const all = loadLocalJobs();
      const updated = all.map(j =>
        j.id === modal.id
          ? { ...j, title: modal.title.trim(), notes: modal.notes.trim() }
          : j
      );
      saveLocalJobs(updated);
      setJobs(updated);

      // 同步更新 JobRequirement.title
      syncJobTitle(modal.id, modal.title.trim());
    }

    setModal(null);
  };

  // 删除确认
  const handleDeleteConfirm = () => {
    if (!deletingId) return;
    const updated = loadLocalJobs().filter(j => j.id !== deletingId);
    saveLocalJobs(updated);
    setJobs(updated);
    setDeletingId(null);
  };

  const handleOpenDelete = (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    setDeletingId(jobId);
  };

  const priorityLabel = (p: string) => {
    const map: Record<string, string> = { core: "核心必要", important: "重要优先", bonus: "优先加分" };
    return map[p] || p;
  };

  const priorityColor = (p: string) => {
    const map: Record<string, string> = {
      core: "bg-red-50 text-red-700 border-red-200",
      important: "bg-orange-50 text-orange-700 border-orange-200",
      bonus: "bg-blue-50 text-blue-700 border-blue-200",
    };
    return map[p] || "bg-gray-50 text-gray-700 border-gray-200";
  };

  const renderItem = (item: ReqItem, i: number) => (
    <div key={i} className="flex items-start gap-3 py-3 border-b last:border-b-0 border-gray-100">
      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${priorityColor(item.priority)} flex-shrink-0 mt-0.5`}>
        {priorityLabel(item.priority)}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{item.category}</p>
        <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">{item.description}</p>
      </div>
    </div>
  );

  const allAbove = result ? [
    ...result.iceberg_above.knowledge.map(x => ({ ...x, type: "知识" })),
    ...result.iceberg_above.skills.map(x => ({ ...x, type: "技能" })),
    ...result.iceberg_above.experience.map(x => ({ ...x, type: "经验" })),
  ] : [];

  const allBelow = result ? [
    ...result.iceberg_below.traits.map(x => ({ ...x, type: "特质" })),
    ...result.iceberg_below.competencies.map(x => ({ ...x, type: "素养" })),
    ...result.iceberg_below.motivations.map(x => ({ ...x, type: "动机" })),
  ] : [];

  const getSummary = (job: SavedJob) => {
    const total = job.coreCount + job.importantCount + job.bonusCount;
    if (total === 0) return "暂无概况";
    return `核心${job.coreCount}项 · 重要${job.importantCount}项 · 加分${job.bonusCount}项`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">职位管理</h2>
        <p className="text-sm text-gray-500 mt-1">解析JD文本，生成结构化职位需求分析报告</p>
      </div>

      {/* 输入区 */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-3">职位描述 (JD) 输入</h3>
        <textarea
          className="input-field h-36 resize-y"
          placeholder="粘贴职位描述文本..."
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            className="btn-primary"
            onClick={handleParse}
            disabled={loading || jdText.trim().length < 2}
          >
            {loading ? "解析中..." : "🤖 AI 解析 JD"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>

      {/* 报告区 + 添加按钮 */}
      {result && (
        <div className="space-y-4">
          <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">📋 职位需求分析报告</h3>
                <p className="text-sm text-gray-500">基于冰山模型，AI 对 JD 的深度解读</p>
              </div>
              <button
                className="btn-success px-4 py-2 text-sm font-medium rounded-lg"
                onClick={handleOpenAdd}
              >
                ➕ 添加职位
              </button>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-2xl">🏔️</span> 冰山上（显性要求）
            </h3>
            {allAbove.length > 0 ? (
              <div className="space-y-0">{allAbove.map(renderItem as any)}</div>
            ) : (
              <p className="text-sm text-gray-400">—</p>
            )}
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-2xl">🌊</span> 冰山下（隐性要求 — AI推断）
            </h3>
            {allBelow.length > 0 ? (
              <div className="space-y-0">{allBelow.map(renderItem as any)}</div>
            ) : (
              <p className="text-sm text-gray-400">—</p>
            )}
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold mb-4">📊 优先级汇总</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-red-50 border border-red-100">
                <h4 className="text-sm font-medium text-red-700 mb-2">🔴 核心必要</h4>
                <p className="text-xs text-red-600 mb-2">必须100%满足，否则无法胜任</p>
                {result.core_requirements?.length > 0 ? (
                  <ul className="space-y-1">
                    {result.core_requirements.map((r, i) => (
                      <li key={i} className="text-sm text-gray-800">• {r.description}</li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-gray-400">—</p>}
              </div>
              <div className="p-4 rounded-lg bg-orange-50 border border-orange-100">
                <h4 className="text-sm font-medium text-orange-700 mb-2">🟠 重要优先</h4>
                <p className="text-xs text-orange-600 mb-2">应大部分满足，缺失影响竞争力</p>
                {result.important_requirements?.length > 0 ? (
                  <ul className="space-y-1">
                    {result.important_requirements.map((r, i) => (
                      <li key={i} className="text-sm text-gray-800">• {r.description}</li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-gray-400">—</p>}
              </div>
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                <h4 className="text-sm font-medium text-blue-700 mb-2">🔵 优先加分</h4>
                <p className="text-xs text-blue-600 mb-2">锦上添花，满足则更具优势</p>
                {result.bonus_requirements?.length > 0 ? (
                  <ul className="space-y-1">
                    {result.bonus_requirements.map((r, i) => (
                      <li key={i} className="text-sm text-gray-800">• {r.description}</li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-gray-400">—</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 职位列表 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            📁 职位列表
            {jobs.length > 0 && (
              <span className="text-sm text-gray-400 font-normal ml-2">
                共 {jobs.length} 个职位
              </span>
            )}
          </h3>
          <button
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            onClick={loadJobs}
            disabled={jobsLoading}
          >
            {jobsLoading ? "刷新中..." : "🔄 刷新"}
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-sm">暂无职位，请在上方粘贴 JD 并点击"AI 解析 JD"，查看报告后再点击"添加职位"</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                    序号
                  </th>
                  <th className="py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    岗位名称
                  </th>
                  <th className="py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    解析概况
                  </th>
                  <th className="py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    创建时间
                  </th>
                  <th className="py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    备注
                  </th>
                  <th className="py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-20 text-right">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((job, index) => (
                  <tr
                    key={job.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/jobs/${job.id}`)}
                  >
                    <td className="py-2 px-2 text-sm text-gray-500 font-mono">
                      {String(index + 1).padStart(2, "0")}
                    </td>
                    <td className="py-2 px-2">
                      <p className="text-sm font-medium text-gray-900">{job.title}</p>
                    </td>
                    <td className="py-2 px-2">
                      <p className="text-sm text-gray-600">{getSummary(job)}</p>
                    </td>
                    <td className="py-2 px-2 text-sm text-gray-500">
                      {formatDate(job.createdAt)}
                    </td>
                    <td className="py-2 px-2">
                      <p className="text-xs text-gray-500 max-w-[160px] truncate">
                        {job.notes || "—"}
                      </p>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="编辑"
                          onClick={(e) => handleOpenEdit(e, job)}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="删除"
                          onClick={(e) => handleOpenDelete(e, job.id)}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 弹窗：添加/编辑职位 ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModal(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 z-10">
            <h3 className="text-lg font-semibold mb-4">
              {modal.mode === "add" ? "➕ 添加职位" : "✏️ 编辑职位"}
            </h3>

            <label className="block mb-3">
              <span className="text-sm font-medium text-gray-700">
                岗位名称 <span className="text-red-500">*</span>
              </span>
              <input
                className="input-field mt-1"
                type="text"
                placeholder="输入岗位名称"
                value={modal.title}
                onChange={(e) => setModal({ ...modal, title: e.target.value })}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleModalConfirm();
                }}
              />
            </label>

            <label className="block mb-5">
              <span className="text-sm font-medium text-gray-700">备注</span>
              <textarea
                className="input-field mt-1 h-20 resize-y"
                placeholder="部门、紧急程度、薪资范围等..."
                value={modal.notes}
                onChange={(e) => setModal({ ...modal, notes: e.target.value })}
              />
            </label>

            <div className="flex justify-end gap-2">
              <button className="btn-secondary text-sm" onClick={() => setModal(null)}>
                取消
              </button>
              <button
                className="btn-primary text-sm"
                onClick={handleModalConfirm}
                disabled={!modal.title.trim()}
              >
                确认{modal.mode === "add" ? "添加" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 删除确认弹窗 ── */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeletingId(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 z-10">
            <h3 className="text-lg font-semibold mb-2">⚠️ 确认删除</h3>
            <p className="text-sm text-gray-600 mb-5">删除后无法恢复，确定要删除该职位吗？</p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary text-sm" onClick={() => setDeletingId(null)}>
                取消
              </button>
              <button
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
                onClick={handleDeleteConfirm}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
