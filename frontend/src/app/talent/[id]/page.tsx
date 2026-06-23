"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getTalentDetail, confirmInterview, parseJD, analyzeMatch, createCandidate, TalentDetail } from "@/lib/api";
import { ratingColor, formatScore } from "@/lib/utils";

type Tab = "resume" | "analysis" | "match" | "interview";

export default function TalentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<TalentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("resume");
  const [interviewing, setInterviewing] = useState(false);
  const [matchJobId, setMatchJobId] = useState("");
  const [manualJD, setManualJD] = useState("");
  const [parseMode, setParseMode] = useState<"select"|"manual">("select");
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<any>(null);
  const jobs = JSON.parse(localStorage.getItem("recruit_jobs_list") || "[]");

  useEffect(() => { if (id) load(); }, [id]);

  const load = async () => {
    try { setData(await getTalentDetail(id)); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleInterview = async () => {
    if (!data?.job_id && !matchJobId) { alert("请先匹配岗位"); return; }
    setInterviewing(true);
    try {
      const d = await confirmInterview(id, { job_id: (data?.job_id || matchJobId)!,
        candidate_data: { name: data?.name, current_title: data?.current_title, current_company: data?.current_company,
          experience_years: data?.experience_years, education: data?.education, school: data?.school,
          skills: data?.skills, industry_tags: data?.industry_tags } });
      setData(d); setTab("interview");
    } catch (e) { alert("生成失败: " + (e instanceof Error ? e.message : "")); }
    finally { setInterviewing(false); }
  };

  const handleManualMatch = async () => {
    setMatching(true); setMatchResult(null);
    try {
      let jid = matchJobId;
      if (parseMode === "manual" && manualJD.trim().length >= 10) {
        const parsed = await parseJD(manualJD.trim());
        jid = parsed.id;
        const jlist = JSON.parse(localStorage.getItem("recruit_jobs_list") || "[]");
        if (!jlist.find((j:any) => j.id === jid)) {
          jlist.unshift({ id: jid, title: parsed.title, coreCount: parsed.core_requirements?.length || 0, importantCount: parsed.important_requirements?.length || 0, bonusCount: parsed.bonus_requirements?.length || 0, notes: "", createdAt: new Date().toISOString() });
          localStorage.setItem("recruit_jobs_list", JSON.stringify(jlist));
        }
      }
      if (!jid) { alert("请选择岗位或输入JD"); setMatching(false); return; }
      let cid = id;
      try { const r = await createCandidate({ name: data?.name||"未知", current_title: data?.current_title||"", current_company: data?.current_company||"", experience_years: data?.experience_years??null, education: data?.education||"", school: data?.school||"", skills: data?.skills||[], industry_tags: data?.industry_tags||[], raw_text: "" }); cid = r.candidate_id; } catch(e){}
      const results = await analyzeMatch(jid, [cid]);
      if (results[0]) setMatchResult(results[0]);
    } catch (e: any) { alert("匹配失败: " + (typeof e==="string"?e:(e?.message||e?.detail||""))); }
    finally { setMatching(false); }
  };

  if (loading) return <div className="p-6"><div className="card text-center py-20"><p className="text-gray-500">加载中...</p></div></div>;
  if (!data) return <div className="p-6"><div className="card text-center py-20"><p className="text-red-500">人才不存在</p><button className="btn-secondary mt-4" onClick={() => router.push("/talent")}>← 返回</button></div></div>;

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "resume", label: "简历原图", icon: "📄" },
    { key: "analysis", label: "AI分析", icon: "🤖" },
    { key: "match", label: "JD匹配", icon: "🎯" },
    { key: "interview", label: "面试题", icon: "💬" },
  ];

  const rj = data.resume_json || {};
  const mj = data.match_json || {};
  const ij = data.interview_json || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button className="btn-secondary text-sm" onClick={() => router.push("/talent")}>← 返回人才库</button>
      </div>

      {/* 标题 */}
      <div className="card bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xl font-bold">
              {(data.name || "?")[0]}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{data.name}</h1>
              <p className="text-sm text-gray-500">{data.current_title}{data.current_company ? ` @ ${data.current_company}` : ""} · {data.source_platform} {data.source_url && <a href={data.source_url} target="_blank" className="text-blue-500 underline ml-2">🔗 查看原简历</a>}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {mj.rating && (
              <div className="text-center">
                <span className={`inline-block px-4 py-2 rounded-xl text-2xl font-bold ${mj.rating==="S"?"bg-purple-500 text-white":mj.rating==="A"?"bg-green-500 text-white":mj.rating==="B"?"bg-yellow-500 text-white":mj.rating==="C"?"bg-red-400 text-white":"bg-gray-300"}`}>{mj.rating} 级</span>
                <div className="text-xs text-gray-400 mt-1">SABC评级</div>
              </div>
            )}
            {data.quick_score != null && <div className="text-right"><div className="text-3xl font-bold text-primary-700">{data.quick_score}</div><div className="text-xs text-gray-400">匹配分数</div></div>}
          </div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {tabs.map(t => (
          <button key={t.key} className={`flex-1 py-2 text-sm rounded-md font-medium transition-colors ${tab === t.key ? "bg-white shadow text-primary-700" : "text-gray-500 hover:text-gray-700"}`}
            onClick={() => setTab(t.key)}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* 简历原图 */}
      {tab === "resume" && (
        <div className="card">
          <h3 className="font-semibold mb-3">📄 简历原图</h3>
          {data.screenshot_url ? (
            <img src={data.screenshot_url} alt="简历原图" className="w-full border rounded-lg" />
          ) : (
            <div className="text-center py-20 text-gray-400"><p className="text-3xl mb-2">📷</p><p>暂未保存截图</p></div>
          )}
        </div>
      )}

      {/* AI 分析 */}
      {tab === "analysis" && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold mb-3">📋 AI 提取信息</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[["姓名", data.name], ["职位", data.current_title], ["公司", data.current_company], ["年限", data.experience_years + "年"], ["学历", data.education], ["学校", data.school]].map(([k, v]) => (
                <div key={k}><span className="text-gray-500">{k}: </span><b>{v || "—"}</b></div>
              ))}
            </div>
            {data.skills.length > 0 && (
              <div className="mt-3 pt-3 border-t"><span className="text-sm text-gray-500">技能: </span>
                <div className="flex flex-wrap gap-1 mt-1">{data.skills.map(s => <span key={s} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{s}</span>)}</div>
              </div>
            )}
          </div>
          {rj.work_experience?.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-3">💼 工作经历</h3>
              {rj.work_experience.map((we: any, i: number) => (
                <div key={i} className="border-b last:border-b-0 py-2 text-sm">
                  <p className="font-medium">{we.title || we.position} · {we.company}</p>
                  <p className="text-gray-500 text-xs">{we.start_date || ""} — {we.end_date || ""}</p>
                  {we.responsibilities?.length > 0 && <ul className="list-disc pl-4 mt-1 text-xs text-gray-600">{we.responsibilities.map((r: string, j: number) => <li key={j}>{r}</li>)}</ul>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* JD 匹配 */}
      {tab === "match" && (
        <div className="card">
          <h3 className="font-semibold mb-3">🎯 JD 匹配分析</h3>
          {/* 匹配输入区 */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg space-y-2">
            <div className="flex gap-1 bg-gray-200 rounded p-0.5 w-fit">
              <button className={`text-xs px-3 py-1 rounded ${parseMode==="select"?"bg-white shadow font-medium":"text-gray-500"}`} onClick={()=>setParseMode("select")}>选择岗位</button>
              <button className={`text-xs px-3 py-1 rounded ${parseMode==="manual"?"bg-white shadow font-medium":"text-gray-500"}`} onClick={()=>setParseMode("manual")}>手动输入JD</button>
            </div>
            {parseMode==="select" ? (
              <div className="flex gap-2">
                <select className="input-field text-sm flex-1" value={matchJobId} onChange={e=>setMatchJobId(e.target.value)}>
                  <option value="">选择岗位...</option>
                  {jobs.map((j:any)=><option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
                <button className="btn-primary text-sm" onClick={handleManualMatch} disabled={matching||!matchJobId}>{matching?"分析中...":"🎯 匹配"}</button>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea className="input-field h-24 text-sm" placeholder="粘贴岗位JD..." value={manualJD} onChange={e=>setManualJD(e.target.value)} />
                <button className="btn-primary text-sm" onClick={handleManualMatch} disabled={matching||manualJD.trim().length<10}>{matching?"解析匹配中...":"🎯 解析并匹配"}</button>
              </div>
            )}
          </div>
          {/* 结果显示 */}
          {mj.rating || matchResult ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1.5 rounded text-lg font-bold ${ratingColor(mj.rating||matchResult?.rating)}`}>{mj.rating||matchResult?.rating}级</span>
                <span className="text-3xl font-bold">{formatScore(mj.overall_score??matchResult?.overall_score)}</span>
                <div className="text-xs text-gray-400">H:{formatScore(mj.hard_score??matchResult?.hard_score)} S:{formatScore(mj.soft_score??matchResult?.soft_score)} B:{formatScore(mj.bonus_score??matchResult?.bonus_score)}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-green-50 rounded">
                  <h4 className="text-sm font-medium text-green-700 mb-2">✅ 匹配点</h4>
                  {(mj.matched_points||matchResult?.matched_points||[]).map((p:string,i:number)=><p key={i} className="text-sm text-gray-700">· {p}</p>)}
                </div>
                <div className="p-3 bg-red-50 rounded">
                  <h4 className="text-sm font-medium text-red-600 mb-2">⚠️ 差距点</h4>
                  {(mj.gap_points||matchResult?.gap_points||[]).map((p:string,i:number)=><p key={i} className="text-sm text-gray-700">· {p}</p>)}
                </div>
              </div>
              {(mj.analysis_summary||matchResult?.analysis_summary) && <p className="text-sm text-gray-600 italic">{mj.analysis_summary||matchResult?.analysis_summary}</p>}
            </div>
          ) : <p className="text-gray-400 text-sm">尚未进行匹配分析</p>}
        </div>
      )}

      {/* 面试题 */}
      {tab === "interview" && (
        <div className="card">
          <h3 className="font-semibold mb-3">💬 面试建议题</h3>
          {ij.questions ? (
            <ol className="list-decimal pl-5 space-y-2 text-sm">
              {(ij.questions || []).map((q: any, i: number) => <li key={i} className="text-gray-800">{typeof q === "string" ? q : (q.question || q.topic || "")}</li>)}
            </ol>
          ) : ij.error ? <p className="text-red-500 text-sm">生成失败: {ij.error}</p> : (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">{(mj.rating||matchResult) ? "已有匹配结果，可以生成面试题：" : "请先在JD匹配Tab完成匹配分析"}</p>
              {(mj.rating||matchResult) && (
                <button className="btn-primary text-sm" onClick={handleInterview} disabled={interviewing}>
                  {interviewing ? "生成中..." : "💡 生成面试题"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 操作区 */}
      <div className="card flex items-center justify-between">
        <div className="text-sm text-gray-500">状态: <span className="font-medium">{data.status === "interviewed" ? "✅ 已邀约" : data.status === "new" ? "📥 新入库" : data.status}</span></div>
        {data.interview_json?.questions?.length ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-green-600">✅ 已生成</span>
            <button className="btn-secondary text-xs" onClick={handleInterview} disabled={interviewing}>{interviewing?"生成中...":"🔄 重新生成"}</button>
          </div>
        ) : (
          <button className="btn-success" onClick={handleInterview} disabled={interviewing}>
            {interviewing ? "生成中..." : "✅ 确认邀约面试"}
          </button>
        )}
      </div>
    </div>
  );
}
