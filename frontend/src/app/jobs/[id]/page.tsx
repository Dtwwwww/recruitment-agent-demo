"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getJob, getTalentList, deleteTalent, updateTalent, JobRequirement, TalentListItem } from "@/lib/api";
import { getLocalJobData } from "../page";
import { ratingColor, formatScore } from "@/lib/utils";

interface ReqItem { category: string; description: string; priority: string; weight: number; type?: string; }

export default function JobDetailPage() {
  const params = useParams(); const router = useRouter();
  const jobId = params.id as string;
  const [job, setJob] = useState<JobRequirement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"jd" | "match">("jd");
  const [talents, setTalents] = useState<TalentListItem[]>([]);
  const [talentsLoading, setTalentsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => { if (!jobId) return;
    const local = getLocalJobData(jobId);
    if (local) { setJob(local); setLoading(false); return; }
    getJob(jobId).then(setJob).catch(e=>setError(e.message)).finally(()=>setLoading(false));
  }, [jobId]);

  useEffect(() => { if (tab==="match") loadTalents(); }, [tab, jobId]);

  const loadTalents = async () => { setTalentsLoading(true); try { setTalents(await getTalentList(jobId)); } catch(e){console.error(e);} finally{setTalentsLoading(false);} };
  const handleDelete = async () => { if (!deletingId) return; try { await deleteTalent(deletingId); setTalents(prev => prev.filter(t => t.id !== deletingId)); } catch(e){} finally { setDeletingId(null); } };
  const handleEdit = (t: TalentListItem) => { setEditing({ id: t.id, name: t.name||"", current_title: t.current_title||"", current_company: t.current_company||"", experience_years: t.experience_years||"", education: t.education||"", school: t.school||"", skills: (t.skills||[]).join(", "), source_platform: t.source_platform||"" }); };
  const handleEditSave = async () => { if (!editing) return; try { await updateTalent(editing.id, { name: editing.name, current_title: editing.current_title, current_company: editing.current_company, experience_years: editing.experience_years?parseInt(editing.experience_years):null, education: editing.education, school: editing.school, skills: editing.skills.split(/[,，、\s]+/).filter(Boolean), source_platform: editing.source_platform }); setTalents(prev => prev.map(t => t.id===editing.id?{...t,name:editing.name,current_title:editing.current_title,current_company:editing.current_company,experience_years:editing.experience_years?parseInt(editing.experience_years):null,education:editing.education,school:editing.school,skills:editing.skills.split(/[,，、\s]+/).filter(Boolean),source_platform:editing.source_platform}:t)); } catch(e){} finally { setEditing(null); } };

  if (loading) return <div className="card text-center py-20"><p className="text-gray-500">加载中...</p></div>;
  if (error||!job) return <div className="card text-center py-20"><p className="text-red-500 mb-4">{error||"不存在"}</p><button className="btn-secondary" onClick={()=>router.push("/jobs")}>← 返回</button></div>;

  const pl = (p:string)=>({core:"核心必要",important:"重要优先",bonus:"优先加分"}[p]||p);
  const pc = (p:string)=>({core:"bg-red-50 text-red-700 border-red-200",important:"bg-orange-50 text-orange-700 border-orange-200",bonus:"bg-blue-50 text-blue-700 border-blue-200"}[p]||"bg-gray-50");
  const ri = (item:ReqItem,i:number)=>(<div key={i} className="flex items-start gap-2 py-2 border-b last:border-b-0 border-gray-100"><span className={`px-1.5 py-0.5 rounded text-xs font-medium border shrink-0 mt-0.5 ${pc(item.priority)}`}>{pl(item.priority)}</span><div className="min-w-0"><p className="text-sm font-medium text-gray-900">{item.category}</p><p className="text-xs text-gray-600">{item.description}</p></div></div>);

  const allAbove = [...job.iceberg_above.knowledge.map(x=>({...x,type:"知识"})),...job.iceberg_above.skills.map(x=>({...x,type:"技能"})),...job.iceberg_above.experience.map(x=>({...x,type:"经验"}))];
  const allBelow = [...job.iceberg_below.traits.map(x=>({...x,type:"特质"})),...job.iceberg_below.competencies.map(x=>({...x,type:"素养"})),...job.iceberg_below.motivations.map(x=>({...x,type:"动机"}))];

  const sCount = talents.filter(t=>t.quick_score&&t.quick_score>=85).length;
  const aCount = talents.filter(t=>t.quick_score&&t.quick_score>=70&&t.quick_score<85).length;
  const bCount = talents.filter(t=>t.quick_score&&t.quick_score>=55&&t.quick_score<70).length;
  const cCount = talents.filter(t=>t.quick_score&&t.quick_score<55).length;

  return (<div className="space-y-6">
    <div className="flex items-center gap-4"><button className="btn-secondary text-sm" onClick={()=>router.push("/jobs")}>← 返回</button></div>
    <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200"><h1 className="text-2xl font-bold">{job.title}</h1><p className="text-sm text-gray-500 mt-1">职位详情</p></div>

    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
      {[{k:"jd",l:"📋 岗位JD分析"},{k:"match",l:"👥 人才匹配清单"}].map(t=>(<button key={t.k} className={`flex-1 py-2 text-sm rounded-md font-medium transition-colors ${tab===t.k?"bg-white shadow text-primary-700":"text-gray-500 hover:text-gray-700"}`} onClick={()=>setTab(t.k as any)}>{t.l}</button>))}
    </div>

    {tab==="jd" && (<div className="space-y-4">
      <div className="card"><h3 className="text-lg font-semibold mb-4">🏔️ 冰山上（显性要求）</h3>{allAbove.length>0?<div>{allAbove.map(ri as any)}</div>:<p className="text-sm text-gray-400">—</p>}</div>
      <div className="card"><h3 className="text-lg font-semibold mb-4">🌊 冰山下（隐性要求）</h3>{allBelow.length>0?<div>{allBelow.map(ri as any)}</div>:<p className="text-sm text-gray-400">—</p>}</div>
      <div className="card"><h3 className="text-lg font-semibold mb-4">📊 优先级汇总</h3><div className="grid grid-cols-3 gap-4">{[{c:"red",l:"核心必要",items:job.core_requirements},{c:"orange",l:"重要优先",items:job.important_requirements},{c:"blue",l:"优先加分",items:job.bonus_requirements}].map(g=>(<div key={g.c} className="p-4 rounded-lg bg-${g.c}-50 border border-${g.c}-100"><h4 className="text-sm font-medium text-${g.c}-700 mb-2">{g.l}</h4>{g.items?.length>0?<ul className="space-y-1">{g.items.map((r:any,i:number)=><li key={i} className="text-sm">• {r.description}</li>)}</ul>:<p className="text-sm text-gray-400">—</p>}</div>))}</div></div>
    </div>)}

    {tab==="match" && (<div className="card">
      <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">👥 候选人匹配清单</h3><button className="text-sm text-primary-600" onClick={loadTalents} disabled={talentsLoading}>🔄 刷新</button></div>

      {talents.length===0 ? (<div className="text-center py-10 text-gray-400"><p>暂无匹配候选人。请在工作台搜索并绑定到此岗位。</p><button className="btn-primary text-sm mt-3" onClick={()=>router.push("/workflow")}>🚀 去工作台</button></div>) : (
        <div>
          <div className="flex gap-4 mb-4 text-sm"><span>共 <b>{talents.length}</b> 人</span><span className="text-purple-600">S: {sCount}</span><span className="text-green-600">A: {aCount}</span><span className="text-yellow-600">B: {bCount}</span><span className="text-red-500">C: {cCount}</span></div>

          {talents.filter(t=>t.quick_score).length>0 && (<div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg mb-4 border border-purple-100"><h4 className="text-sm font-semibold mb-2">📋 可落地规划</h4><p className="text-sm text-gray-700">S级({sCount}人)：建议<b>即日安排面试</b>，重点考察核心技能匹配度和文化契合。| A级({aCount}人)：<b>3日内联系</b>，确认求职意向后安排面试。| 面试准备：基于差距点设计面试题，重点考察候选人短板项。| 建议优先联系S/A级候选人。</p></div>)}

          <div className="space-y-2">
            {talents.map(t => { const expanded = expandedId===t.id; const mj = (t as any).match_json; return (
              <div key={t.id}>
                <div className={`border rounded-lg p-3 hover:shadow transition-shadow ${expanded?"border-primary-300 bg-primary-50":""}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={()=>setExpandedId(expanded?null:t.id)}>
                      <span className="font-medium">{t.name||"?"}</span>
                      <span className="text-sm text-gray-500">{t.current_title||""}</span>
                      {t.current_company&&<span className="text-xs text-gray-400">@ {t.current_company}</span>}
                      {t.quick_score!=null&&<>
                        {mj?.rating && <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${ratingColor(mj.rating)}`}>{mj.rating}级</span>}
                        <span className="font-bold ml-1">{formatScore(t.quick_score)}</span>
                      </>}
                      {!t.quick_score && <span className="text-xs text-gray-400">未分析</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded" title="查看详情" onClick={()=>router.push(`/talent/${t.id}`)}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      </button>
                      <button className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="编辑" onClick={()=>handleEdit(t)}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="删除" onClick={()=>setDeletingId(t.id)}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
                {expanded && mj && (<div className="border-x border-b rounded-b-lg p-4 bg-white -mt-px ml-4">
                  <div className="flex items-center gap-3 mb-2"><span className={`px-2 py-0.5 rounded text-xs font-bold ${ratingColor(mj.rating)}`}>{mj.rating}级</span><span className="text-lg font-bold">{formatScore(mj.overall_score)}</span><span className="text-xs text-gray-400">H:{formatScore(mj.hard_score)} S:{formatScore(mj.soft_score)} B:{formatScore(mj.bonus_score)}</span></div>
                  <div className="grid grid-cols-2 gap-3">{mj.matched_points?.length>0&&<div><p className="text-xs font-medium text-green-600 mb-1">✅ 匹配点</p>{mj.matched_points.map((p:string,j:number)=><p key={j} className="text-xs text-gray-600">· {p}</p>)}</div>}{mj.gap_points?.length>0&&<div><p className="text-xs font-medium text-red-500 mb-1">⚠️ 差距点</p>{mj.gap_points.map((p:string,j:number)=><p key={j} className="text-xs text-gray-600">· {p}</p>)}</div>}</div>
                  {mj.analysis_summary&&<p className="text-xs text-gray-500 mt-2 italic">{mj.analysis_summary}</p>}
                </div>)}
              </div>
            );})}
          </div>
        </div>
      )}
    </div>)}

    {/* 删除确认 */}
    {deletingId && (<div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/40" onClick={()=>setDeletingId(null)} /><div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 z-10"><h3 className="text-lg font-semibold mb-2">确认删除</h3><p className="text-sm text-gray-600 mb-5">删除后无法恢复</p><div className="flex justify-end gap-2"><button className="btn-secondary text-sm" onClick={()=>setDeletingId(null)}>取消</button><button className="px-4 py-2 bg-red-600 text-white text-sm rounded-md" onClick={handleDelete}>确认删除</button></div></div></div>)}

    {/* 编辑弹窗 */}
    {editing && (<div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] overflow-y-auto"><div className="absolute inset-0 bg-black/40" onClick={()=>setEditing(null)} /><div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4 z-10"><h3 className="text-lg font-semibold mb-4">编辑人才</h3><div className="grid grid-cols-2 gap-3"><label className="block"><span className="text-sm">姓名</span><input className="input-field mt-1" value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})} /></label><label className="block"><span className="text-sm">来源</span><select className="input-field mt-1" value={editing.source_platform} onChange={e=>setEditing({...editing,source_platform:e.target.value})}><option value="">—</option><option>liepin</option><option>bosszhipin</option></select></label><label className="block"><span className="text-sm">职位</span><input className="input-field mt-1" value={editing.current_title} onChange={e=>setEditing({...editing,current_title:e.target.value})} /></label><label className="block"><span className="text-sm">公司</span><input className="input-field mt-1" value={editing.current_company} onChange={e=>setEditing({...editing,current_company:e.target.value})} /></label><label className="block"><span className="text-sm">年限</span><input className="input-field mt-1" type="number" value={editing.experience_years} onChange={e=>setEditing({...editing,experience_years:e.target.value})} /></label><label className="block"><span className="text-sm">学历</span><select className="input-field mt-1" value={editing.education} onChange={e=>setEditing({...editing,education:e.target.value})}><option value="">—</option><option>博士</option><option>硕士</option><option>本科</option><option>大专</option></select></label><label className="block col-span-2"><span className="text-sm">学校</span><input className="input-field mt-1" value={editing.school} onChange={e=>setEditing({...editing,school:e.target.value})} /></label><label className="block col-span-2"><span className="text-sm">技能</span><input className="input-field mt-1" value={editing.skills} onChange={e=>setEditing({...editing,skills:e.target.value})} /></label></div><div className="flex justify-end gap-2 mt-5"><button className="btn-secondary text-sm" onClick={()=>setEditing(null)}>取消</button><button className="btn-primary text-sm" onClick={handleEditSave}>保存</button></div></div></div>)}
  </div>);
}
