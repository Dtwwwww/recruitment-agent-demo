"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getTalentList, batchMatchTalent, deleteTalent, updateTalent, TalentListItem, MatchSummary } from "@/lib/api";
import { ratingColor, formatScore } from "@/lib/utils";

export default function TalentPage() {
  const router = useRouter();
  const [allTalents, setAllTalents] = useState<TalentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matching, setMatching] = useState(false);
  const [summaries, setSummaries] = useState<MatchSummary[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterJob, setFilterJob] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterExp, setFilterExp] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("");

  useEffect(() => { loadTalents(); }, []);
  useEffect(() => { setCurrentPage(1); }, [filterJob, filterCity, filterExp, filterPlatform, pageSize]);

  const loadTalents = async () => {
    try { const t = await getTalentList(); setAllTalents(t); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const jobs = JSON.parse(localStorage.getItem("recruit_jobs_list") || "[]");
  const cities = ["北京","上海","广州","深圳","杭州","成都","南京","武汉","西安","苏州","重庆","长沙"];

  const talents = allTalents
    .filter(t => !filterJob || t.job_id === filterJob)
    .filter(t => !filterPlatform || t.source_platform === filterPlatform)
    .filter(t => {
      if (!filterExp) return true;
      const y = t.experience_years || 0;
      if (filterExp === "1-3") return y >= 1 && y < 3;
      if (filterExp === "3-5") return y >= 3 && y < 5;
      if (filterExp === "5-10") return y >= 5 && y < 10;
      if (filterExp === "10+") return y >= 10;
      return true;
    })
    .sort((a, b) => (b.quick_score || 0) - (a.quick_score || 0));
  const totalPages = Math.max(1, Math.ceil(talents.length / pageSize));
  const paged = talents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggle = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    if (deletingId === "__batch__") {
      // 批量删除
      const ids = Array.from(selected);
      for (const id of ids) {
        try { await deleteTalent(id); } catch (e) {}
      }
      setAllTalents(prev => prev.filter(t => !selected.has(t.id)));
      setSelected(new Set());
    } else {
      try { await deleteTalent(deletingId); setAllTalents(prev => prev.filter(t => t.id !== deletingId)); }
      catch (e) { alert("删除失败"); }
    }
    setDeletingId(null);
  };

  const handleEdit = (t: TalentListItem) => {
    setEditing({ id: t.id, name: t.name || "", current_title: t.current_title || "",
      current_company: t.current_company || "", experience_years: t.experience_years || "",
      education: t.education || "", school: t.school || "",
      skills: (t.skills || []).join(", "), industry_tags: ((t as any).industry_tags || []).join(", "),
      source_platform: t.source_platform || "" });
  };

  const handleEditSave = async () => {
    if (!editing) return;
    try {
      await updateTalent(editing.id, {
        name: editing.name, current_title: editing.current_title,
        current_company: editing.current_company,
        experience_years: editing.experience_years ? parseInt(editing.experience_years) : null,
        education: editing.education, school: editing.school,
        skills: editing.skills.split(/[,，、\s]+/).filter(Boolean),
        industry_tags: editing.industry_tags.split(/[,，、\s]+/).filter(Boolean),
        source_platform: editing.source_platform,
      });
      setAllTalents(prev => prev.map(t => t.id === editing.id ? { ...t, ...editing, skills: editing.skills.split(/[,，、\s]+/).filter(Boolean) } : t));
    } catch (e) { alert("保存失败"); }
    finally { setEditing(null); }
  };

  const handleBatchMatch = async () => {
    if (selected.size === 0) return;
    setMatching(true);
    try {
      const tids = Array.from(selected);
      const jid = talents.find(t => tids.includes(t.id))?.job_id;
      if (!jid) { alert("未找到关联JD"); return; }
      const r = await batchMatchTalent(jid, tids);
      setSummaries(r);
    } catch (e) { alert("匹配分析失败: " + (e instanceof Error ? e.message : "")); }
    finally { setMatching(false); }
  };

  if (loading) return <div className="p-6"><div className="card text-center py-20"><p className="text-gray-500">加载中...</p></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold">📁 人才库</h2><p className="text-sm text-gray-500 mt-1">AI 筛选入库的候选人 · 匹配分析 · 面试邀约</p></div>
        <button className="btn-primary" onClick={() => router.push("/workflow")}>🚀 开始筛选</button>
      </div>

      {/* 筛选栏 */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-center text-sm">
          <select className="input-field w-auto text-xs" value={filterJob} onChange={e=>setFilterJob(e.target.value)}>
            <option value="">全部岗位</option>
            {jobs.map((j:any)=><option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <select className="input-field w-auto text-xs" value={filterPlatform} onChange={e=>setFilterPlatform(e.target.value)}>
            <option value="">全部平台</option><option value="liepin">猎聘</option><option value="bosszhipin">BOSS直聘</option>
          </select>
          <select className="input-field w-auto text-xs" value={filterExp} onChange={e=>setFilterExp(e.target.value)}>
            <option value="">不限经验</option><option value="1-3">1-3年</option><option value="3-5">3-5年</option><option value="5-10">5-10年</option><option value="10+">10年+</option>
          </select>
          <select className="input-field w-auto text-xs" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>
            <option value={10}>10条</option><option value={20}>20条</option><option value={50}>50条</option><option value={100}>100条</option>
          </select>
          <span className="text-xs text-gray-400">共{allTalents.length}人, 显示{Math.min(pageSize,talents.length)}条</span>
        </div>
      </div>

      {/* 操作栏 */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button className="text-sm text-primary-600" onClick={() => setSelected(new Set(paged.map(t => t.id)))}>全选</button>
            <button className="text-sm text-gray-400" onClick={() => setSelected(new Set())}>取消</button>
            {selected.size > 0 && <button className="text-sm text-red-500 hover:text-red-700" onClick={() => setDeletingId("__batch__")}>🗑️ 批量删除 ({selected.size})</button>}
          </div>
          <button className="btn-primary text-sm" onClick={handleBatchMatch} disabled={matching || selected.size === 0}>
            {matching ? "分析中..." : `📊 匹配分析 (${selected.size})`}
          </button>
        </div>
      </div>

      {/* 对比结果 */}
      {summaries.length > 0 && (
        <div className="card bg-purple-50 border-purple-200">
          <h3 className="font-semibold mb-3">📊 对比概况 · 共 {summaries.length} 人</h3>
          <div className="flex gap-3 mb-3 text-sm">
            {[["S","text-purple-600"],["A","text-green-600"],["B","text-yellow-600"],["C","text-red-500"]].map(([r, c]) => (
              <span key={r}><b className={c}>{summaries.filter(s => s.rating === r).length}</b> {r}级</span>
            ))}
            <span>均分: <b>{summaries.length > 0 ? (summaries.reduce((a,s) => a + (s.overall_score||0), 0) / summaries.length).toFixed(1) : 0}</b></span>
          </div>
          <div className="space-y-2">
            {summaries.map((s, i) => (
              <div key={s.talent_id} className="bg-white rounded-lg p-3 text-sm cursor-pointer hover:shadow transition-shadow"
                onClick={() => router.push(`/talent/${s.talent_id}`)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">#{i + 1}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${ratingColor(s.rating)}`}>{s.rating}级</span>
                    <span className="font-medium">{s.name}</span>
                    <span className="text-gray-400">{s.current_title}</span>
                  </div>
                  <span className="font-bold text-lg">{formatScore(s.overall_score)}</span>
                </div>
                {s.matched_points?.slice(0, 2).map((p, j) => <p key={j} className="text-xs text-green-600 mt-1">✅ {p}</p>)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 人才列表 */}
      {paged.length === 0 ? (
        <div className="card text-center py-16 text-gray-400"><p className="text-3xl mb-2">📭</p><p>人才库为空，去工作台开始筛选</p></div>
      ) : (
        <div className="space-y-2">
          {paged.map(t => (
            <label key={t.id} className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer hover:shadow transition-shadow
              ${selected.has(t.id) ? "border-primary-300 bg-primary-50" : "border-gray-200"}`}>
              <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="w-4 h-4" />
              <div className="flex-1 min-w-0" onClick={() => router.push(`/talent/${t.id}`)}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-sm text-gray-500">{t.current_title}</span>
                  {t.current_company && <span className="text-sm text-gray-400">@ {t.current_company}</span>}
                  <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{t.source_platform}</span>
                  {t.source_url && <a href={t.source_url} target="_blank" className="text-xs text-blue-500 hover:underline" onClick={e=>e.stopPropagation()}>🔗原简历</a>}
                  {t.quick_score != null && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${t.quick_score >= 85 ? "bg-purple-100 text-purple-700" : t.quick_score >= 70 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {t.quick_score}分
                    </span>
                  )}
                </div>
                <div className="flex gap-3 text-xs text-gray-500 mt-1">
                  {t.experience_years != null && <span>{t.experience_years}年</span>}
                  {t.education && <span>{t.education}</span>}
                  {t.school && <span>{t.school}</span>}
                </div>
                {t.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {t.skills.slice(0, 5).map(s => <span key={s} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{s}</span>)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                <button className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="编辑" onClick={() => handleEdit(t)}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="删除" onClick={() => setDeletingId(t.id)}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </label>
          ))}
        </div>
      )}

      {/* 翻页 */}
      <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t">
        <button className="btn-secondary text-xs px-3 py-1" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>← 上一页</button>
        <span className="text-sm text-gray-500">第</span>
        <input type="number" min={1} max={totalPages} value={currentPage}
          className="w-12 text-center text-sm border rounded px-1 py-0.5"
          onChange={e => { const v = parseInt(e.target.value); if (v >= 1 && v <= totalPages) setCurrentPage(v); }} />
        <span className="text-sm text-gray-500">/ {totalPages} 页 · 共 {talents.length} 人</span>
        <button className="btn-secondary text-xs px-3 py-1" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>下一页 →</button>
      </div>

      {/* 删除确认 */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/40" onClick={()=>setDeletingId(null)} /><div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 z-10"><h3 className="text-lg font-semibold mb-2">确认删除</h3><p className="text-sm text-gray-600 mb-5">{deletingId==="__batch__" ? `确定要删除选中的 ${selected.size} 人吗？` : "删除后无法恢复"}</p><div className="flex justify-end gap-2"><button className="btn-secondary text-sm" onClick={()=>setDeletingId(null)}>取消</button><button className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700" onClick={handleDelete}>确认删除</button></div></div></div>
      )}

      {/* 编辑弹窗 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] overflow-y-auto"><div className="absolute inset-0 bg-black/40" onClick={()=>setEditing(null)} /><div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4 z-10">
          <h3 className="text-lg font-semibold mb-4">编辑人才</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm">姓名</span><input className="input-field mt-1" value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})} /></label>
            <label className="block"><span className="text-sm">来源平台</span><select className="input-field mt-1" value={editing.source_platform} onChange={e=>setEditing({...editing,source_platform:e.target.value})}><option value="">—</option><option value="liepin">猎聘</option><option value="bosszhipin">BOSS直聘</option></select></label>
            <label className="block"><span className="text-sm">当前职位</span><input className="input-field mt-1" value={editing.current_title} onChange={e=>setEditing({...editing,current_title:e.target.value})} /></label>
            <label className="block"><span className="text-sm">当前公司</span><input className="input-field mt-1" value={editing.current_company} onChange={e=>setEditing({...editing,current_company:e.target.value})} /></label>
            <label className="block"><span className="text-sm">工作年限</span><input className="input-field mt-1" type="number" value={editing.experience_years} onChange={e=>setEditing({...editing,experience_years:e.target.value})} /></label>
            <label className="block"><span className="text-sm">学历</span><select className="input-field mt-1" value={editing.education} onChange={e=>setEditing({...editing,education:e.target.value})}><option value="">—</option><option>博士</option><option>硕士</option><option>本科</option><option>大专</option></select></label>
            <label className="block col-span-2"><span className="text-sm">学校</span><input className="input-field mt-1" value={editing.school} onChange={e=>setEditing({...editing,school:e.target.value})} /></label>
            <label className="block col-span-2"><span className="text-sm">技能（逗号分隔）</span><input className="input-field mt-1" value={editing.skills} onChange={e=>setEditing({...editing,skills:e.target.value})} /></label>
            <label className="block col-span-2"><span className="text-sm">行业（逗号分隔）</span><input className="input-field mt-1" value={editing.industry_tags} onChange={e=>setEditing({...editing,industry_tags:e.target.value})} /></label>
          </div>
          <div className="flex justify-end gap-2 mt-5"><button className="btn-secondary text-sm" onClick={()=>setEditing(null)}>取消</button><button className="btn-primary text-sm" onClick={handleEditSave}>保存</button></div>
        </div></div>
      )}
    </div>
  );
}
