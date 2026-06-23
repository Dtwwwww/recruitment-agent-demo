"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { parseJD, analyzeMatch, createCandidate, ResumeAnalysis } from "@/lib/api";
import { ratingColor, formatScore } from "@/lib/utils";

interface CandidateRecord {
  id: string; name: string; currentTitle: string; currentCompany: string;
  experienceYears: number | null; education: string; school: string;
  skills: string[]; industryTags: string[]; sourcePlatform: string; notes: string;
  createdAt: string; aiAnalysis?: ResumeAnalysis;
  jobId?: string; matchScore?: number; matchRating?: string; workflowInfo?: any;
}

type Tab = "analysis" | "match" | "interview";

const STORAGE_KEY = "recruit_candidates";

function getCandidate(id: string): CandidateRecord | null {
  try { const r = localStorage.getItem(STORAGE_KEY); if (!r) return null; return JSON.parse(r).find((c: any) => c.id === id) || null; }
  catch { return null; }
}

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [candidate, setCandidate] = useState<CandidateRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("analysis");
  const [matchJobId, setMatchJobId] = useState("");
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<any>(null);
  const [generatingIQ, setGeneratingIQ] = useState(false);
  const [manualJD, setManualJD] = useState("");
  const [parseMode, setParseMode] = useState<"select" | "manual">("select");
  const [showRematch, setShowRematch] = useState(false);

  useEffect(() => { if (id) { setCandidate(getCandidate(id)); setLoading(false); } }, [id]);

  const jobs = JSON.parse(localStorage.getItem("recruit_jobs_list") || "[]");

  const updateCandidate = (updates: Partial<CandidateRecord>) => {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const idx = list.findIndex((c: any) => c.id === id);
    if (idx >= 0) { list[idx] = { ...list[idx], ...updates }; localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
    setCandidate(prev => prev ? { ...prev, ...updates } : null);
  };

  const handleManualMatch = async () => {
    setMatching(true); setMatchResult(null);
    try {
      let jobId = matchJobId;

      // 手动输入JD：先解析
      if (parseMode === "manual" && manualJD.trim()) {
        if (manualJD.trim().length < 10) { alert("JD文本至少需要10个字符"); setMatching(false); return; }
        try {
          const parsed = await parseJD(manualJD.trim());
          jobId = parsed.id;
          const jobsList = JSON.parse(localStorage.getItem("recruit_jobs_list") || "[]");
          if (!jobsList.find((j: any) => j.id === jobId)) {
            jobsList.unshift({ id: jobId, title: parsed.title, coreCount: parsed.core_requirements?.length || 0, importantCount: parsed.important_requirements?.length || 0, bonusCount: parsed.bonus_requirements?.length || 0, notes: "", createdAt: new Date().toISOString() });
            localStorage.setItem("recruit_jobs_list", JSON.stringify(jobsList));
            const data = JSON.parse(localStorage.getItem("recruit_jobs_data") || "{}");
            data[jobId] = parsed; localStorage.setItem("recruit_jobs_data", JSON.stringify(data));
          }
        } catch (e: any) {
          const msg = typeof e === "string" ? e : (e?.message || e?.detail || "");
          alert("JD解析失败: " + (msg || "请确认JD文本不少于10个字符，且后端与千问API连接正常"));
          setMatching(false); return;
        }
      }

      if (!jobId) { alert("请选择岗位或输入JD（至少10个字符）"); setMatching(false); return; }

      // 先在后端创建候选人获取有效UUID（localStorage短hash不被后端UUID校验接受）
      let cid: string;
      try {
        const resp = await createCandidate({
          name: candidate?.name || "未知", current_title: candidate?.currentTitle || "",
          current_company: candidate?.currentCompany || "", experience_years: candidate?.experienceYears ?? null,
          education: candidate?.education || "", school: candidate?.school || "",
          skills: candidate?.skills || [], industry_tags: candidate?.industryTags || [],
          raw_text: JSON.stringify(candidate?.aiAnalysis || {}),
        });
        cid = resp.candidate_id;
      } catch (e: any) {
        console.error("[match] createCandidate failed:", e);
        alert("创建候选人失败: " + (typeof e === "string" ? e : (e?.message || e?.detail || "请检查后端")));
        setMatching(false); return;
      }

      const results = await analyzeMatch(jobId, [cid]);
      console.log("[match] analyzeMatch result:", results);
      const result = results[0];
      if (result) {
        setMatchResult(result);
        const wf = {
          jdTitle: jobs.find((j: any) => j.id === jobId)?.title || manualJD.trim().split("\n")[0]?.slice(0, 40) || "手动JD",
          matchedPoints: result.matched_points || [],
          gapPoints: result.gap_points || [],
        };
        updateCandidate({ jobId, matchScore: result.overall_score ?? undefined, matchRating: result.rating ?? undefined, workflowInfo: wf });
      }
    } catch (e: any) { alert("匹配分析失败: " + (typeof e === "string" ? e : (e?.message || e?.detail || JSON.stringify(e).slice(0, 200)))); }
    finally { setMatching(false); }
  };

  const handleGenInterview = async () => {
    setGeneratingIQ(true);
    try {
      const jobId = candidate?.jobId || matchJobId;
      if (!jobId) { alert("请先匹配岗位"); return; }

      const { confirmInterview } = await import("@/lib/api");
      // 带上候选人数据，后端用于生成面试题
      const talent = await confirmInterview(id, {
        job_id: jobId,
        candidate_data: {
          name: candidate?.name, current_title: candidate?.currentTitle ?? "",
          current_company: candidate?.currentCompany ?? "", experience_years: candidate?.experienceYears ?? null,
          education: candidate?.education ?? "", school: candidate?.school ?? "",
          skills: candidate?.skills ?? [], industry_tags: candidate?.industryTags ?? [],
          source_platform: candidate?.sourcePlatform ?? "",
          ai_analysis: candidate?.aiAnalysis,
        },
      });
      const rawQ = talent.interview_json?.questions || [];
      const questions = rawQ.map((q: any) => typeof q === "string" ? q : (q.question || q.topic || ""));
      updateCandidate({ workflowInfo: { ...wf, interviewQuestions: questions.length > 0 ? questions : ["生成成功但返回空。请检查千问API是否欠费。"] } });
    } catch (e: any) { alert("生成失败: " + (typeof e === "string" ? e : (e?.message || e?.detail || JSON.stringify(e).slice(0, 200)))); }
    finally { setGeneratingIQ(false); }
  };

  if (loading) return <div className="p-6"><div className="card text-center py-20"><p className="text-gray-500">加载中...</p></div></div>;
  if (!candidate) return <div className="p-6"><div className="card text-center py-20"><p className="text-red-500 mb-4">候选人不存在</p><button className="btn-secondary" onClick={()=>router.push("/candidates")}>← 返回</button></div></div>;

  const a = candidate.aiAnalysis;
  const wf = candidate.workflowInfo || {};
  const jobName = (() => { try { const j = JSON.parse(localStorage.getItem("recruit_jobs_list")||"[]"); return j.find((x:any)=>x.id===candidate.jobId)?.title || ""; } catch { return ""; } })();

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "analysis", label: "AI分析", icon: "🤖" },
    { key: "match", label: "JD匹配", icon: "🎯" },
    { key: "interview", label: "面试题", icon: "💬" },
  ];

  return (<div className="space-y-6">
    <div className="flex items-center gap-4">
      <button className="btn-secondary text-sm" onClick={()=>router.push("/candidates")}>← 返回候选人列表</button>
    </div>

    {/* Header with SABC */}
    <div className="card bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-purple-200 text-purple-700 flex items-center justify-center text-xl font-bold">{(candidate.name||"?")[0]}</div>
          <div>
            <h1 className="text-2xl font-bold">{candidate.name}</h1>
            <p className="text-sm text-gray-500">{candidate.currentTitle} · {candidate.sourcePlatform} {jobName ? `· ${jobName}` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {candidate.matchRating && (
            <div className="text-center">
              <span className={`inline-block px-4 py-2 rounded-xl text-xl font-bold ${ratingColor(candidate.matchRating)}`}>{candidate.matchRating} 级</span>
              <div className="text-xs text-gray-400 mt-1">匹配评级</div>
            </div>
          )}
          {candidate.matchScore != null && (
            <div className="text-right"><div className="text-2xl font-bold text-primary-700">{candidate.matchScore}</div><div className="text-xs text-gray-400">匹配分数</div></div>
          )}
        </div>
      </div>
    </div>

    {/* Tabs */}
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
      {tabs.map(t => (<button key={t.key} className={`flex-1 py-2 text-sm rounded-md font-medium transition-colors ${tab===t.key?"bg-white shadow text-primary-700":"text-gray-500 hover:text-gray-700"}`} onClick={()=>setTab(t.key)}>{t.icon} {t.label}</button>))}
    </div>

    {/* AI分析 Tab */}
    {tab==="analysis" && a && (<div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold mb-3">📋 基本信息</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[["姓名",a.basic_info.name],["性别",a.basic_info.gender],["年龄",a.basic_info.age_range],["城市",a.basic_info.city],["邮箱",a.basic_info.email],["手机",a.basic_info.phone]].map(([l,v])=><div key={l}><span className="text-gray-500">{l}：</span><span className={v&&v!=="信息不足"?"text-gray-900":"text-gray-400"}>{v&&v!=="信息不足"?v:"—"}</span></div>)}
          </div>
        </div>
        <div className="card"><h3 className="font-semibold mb-3">🎯 求职意向</h3><div className="grid grid-cols-2 gap-2 text-sm">{[["期望职位",a.job_preference.desired_title],["期望薪资",a.job_preference.expected_salary],["地点",a.job_preference.location.join("、")],["行业",a.job_preference.desired_industry.join("、")]].map(([l,v])=><div key={l}><span className="text-gray-500">{l}：</span><span className="text-gray-900">{v||"—"}</span></div>)}</div></div>
      </div>
      <div className="card"><h3 className="font-semibold mb-3">🎓 教育背景</h3><div className="flex gap-4 flex-wrap text-sm"><span><b>学历：</b>{a.education.degree!=="信息不足"?a.education.degree:"—"}</span><span><b>学校：</b>{a.education.school!=="信息不足"?a.education.school:"—"}{a.education.is_elite_school&&<span className="text-purple-600 ml-1">🏅{a.education.elite_note||"名校"}</span>}</span><span><b>专业：</b>{a.education.major!=="信息不足"?a.education.major:"—"}</span><span><b>毕业：</b>{a.education.graduation_year!=="信息不足"?a.education.graduation_year:"—"}</span></div></div>
      {a.work_experience.length>0&&<div className="card"><h3 className="font-semibold mb-3">💼 工作经历（{a.work_experience.length}段）</h3><div className="space-y-3">{a.work_experience.map((we,i)=><div key={i} className="border rounded-lg p-4"><div className="flex justify-between mb-1"><p className="font-semibold">{we.title} · {we.company}</p><span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{we.duration}</span></div><p className="text-sm text-gray-500 mb-2">{we.start_date} — {we.end_date}</p>{we.responsibilities.length>0&&<ul className="list-disc pl-5 text-sm space-y-0.5 mb-2">{we.responsibilities.map((r,j)=><li key={j}>{r}</li>)}</ul>}{we.achievements.length>0&&<div className="text-sm text-green-700">🏆 {we.achievements.join("；")}</div>}</div>)}</div></div>}
      <div className="grid grid-cols-2 gap-4">
        <div className="card"><h3 className="font-semibold mb-3">🛠️ 技能</h3><div className="space-y-2 text-sm">{a.skills.expert.length>0&&<div><span className="font-medium text-purple-700">精通：</span><div className="flex flex-wrap gap-1 mt-0.5">{a.skills.expert.map(s=><span key={s} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{s}</span>)}</div></div>}{a.skills.proficient.length>0&&<div><span className="font-medium text-blue-700">熟练：</span><div className="flex flex-wrap gap-1 mt-0.5">{a.skills.proficient.map(s=><span key={s} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{s}</span>)}</div></div>}{a.skills.familiar.length>0&&<div><span className="font-medium text-gray-600">了解：</span><div className="flex flex-wrap gap-1 mt-0.5">{a.skills.familiar.map(s=><span key={s} className="text-xs bg-gray-100 px-2 py-0.5 rounded">{s}</span>)}</div></div>}</div></div>
        {a.projects.length>0&&<div className="card"><h3 className="font-semibold mb-3">📐 项目</h3><div className="space-y-2 max-h-80 overflow-y-auto">{a.projects.map((p,i)=><div key={i} className="border rounded p-3 text-sm"><p className="font-medium">{p.name} <span className="text-gray-400">· {p.role} · {p.duration}</span></p><p className="text-xs text-gray-500">{p.tech_stack.join("、")}</p>{p.highlights.length>0&&<ul className="list-disc pl-4 mt-1 text-xs">{p.highlights.map((h,j)=><li key={j}>{h}</li>)}</ul>}</div>)}</div></div>}
      </div>
      <div className="card"><h3 className="font-semibold mb-3">📈 职业轨迹</h3><div className="flex gap-4 flex-wrap text-sm"><span>总年限：<b>{a.career_trajectory.total_years}年</b></span><span>公司数：<b>{a.career_trajectory.company_count}</b></span><span>平均在职：<b>{a.career_trajectory.avg_tenure_months}个月</b></span><span className={`font-medium ${a.career_trajectory.stability_score>=80?"text-green-600":a.career_trajectory.stability_score>=60?"text-yellow-600":"text-red-500"}`}>稳定度：<b>{a.career_trajectory.stability_score}分</b></span></div>{a.career_trajectory.promotion_path.length>0&&<p className="text-sm mt-1">晋升：{a.career_trajectory.promotion_path.join(" → ")}</p>}<p className="text-sm text-gray-500 mt-0.5">{a.career_trajectory.stability_assessment}</p></div>
      <div className="grid grid-cols-2 gap-4"><div className="card bg-green-50/50 border-green-100"><h3 className="font-semibold mb-3 text-green-800">✅ 优势</h3><ul className="list-disc pl-5 space-y-1 text-sm">{a.strengths.length>0?a.strengths.map((s,i)=><li key={i}>{s}</li>):<li className="text-gray-400">—</li>}</ul></div><div className="card bg-red-50/50 border-red-100"><h3 className="font-semibold mb-3 text-red-700">⚠️ 风险</h3><ul className="list-disc pl-5 space-y-1 text-sm">{a.weaknesses.length>0?a.weaknesses.map((w,i)=><li key={i}>{w}</li>):<li className="text-gray-400">—</li>}</ul></div></div>
      <div className="card bg-purple-50 border-purple-200"><div className="mb-3"><span className="text-sm text-gray-500">🏆 综合评级：</span><span className="text-lg font-bold text-purple-700">{a.overall_rating}</span></div>{a.development_advice.length>0&&<div className="mb-3"><h4 className="font-semibold text-sm mb-2">💡 发展建议</h4><ol className="list-decimal pl-5 space-y-1 text-sm">{a.development_advice.map((adv,i)=><li key={i}>{adv}</li>)}</ol></div>}{a.analysis_summary&&<div className="border-t border-purple-200 pt-3"><h4 className="font-semibold text-sm mb-1">📝 综合分析</h4><p className="text-sm leading-relaxed">{a.analysis_summary}</p></div>}</div>
    </div>)}

    {tab==="analysis" && !a && (<div className="card text-center py-20 text-gray-400"><p className="text-3xl mb-2">🤖</p><p>该候选人未进行 AI 深度分析</p></div>)}

    {/* JD匹配 Tab */}
    {tab==="match" && (<div className="space-y-4">
      <div className="card">
        <h3 className="font-semibold mb-3">🎯 JD匹配分析 {jobName ? `— ${jobName}` : ""}</h3>
        {candidate.matchRating || matchResult ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`px-4 py-2 rounded-xl text-xl font-bold ${ratingColor(candidate.matchRating || matchResult?.rating)}`}>{candidate.matchRating || matchResult?.rating} 级</span>
                <span className="text-3xl font-bold">{formatScore(candidate.matchScore ?? matchResult?.overall_score)}</span>
                {matchResult && <span className="text-xs text-green-600 font-medium">分析完成</span>}
              </div>
              <button className="btn-secondary text-xs" onClick={()=>{setShowRematch(!showRematch);setMatchResult(null);setManualJD("");setMatchJobId("");}}>
                {showRematch ? "收起" : "🔄 匹配其他岗位"}
              </button>
            </div>
            {/* 重新匹配输入区 */}
            {showRematch && (
              <div className="p-3 bg-gray-50 rounded-lg space-y-2">
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
            )}
            {(wf.matchedPoints?.length>0 || matchResult?.matched_points?.length>0) && <div className="p-3 bg-green-50 rounded"><h4 className="text-sm font-medium text-green-700 mb-2">✅ 匹配点</h4>{(wf.matchedPoints||matchResult?.matched_points||[]).map((p:string,i:number)=><p key={i} className="text-sm">· {p}</p>)}</div>}
            {(wf.gapPoints?.length>0 || matchResult?.gap_points?.length>0) && <div className="p-3 bg-red-50 rounded"><h4 className="text-sm font-medium text-red-600 mb-2">⚠️ 差距点</h4>{(wf.gapPoints||matchResult?.gap_points||[]).map((p:string,i:number)=><p key={i} className="text-sm">· {p}</p>)}</div>}
            {matchResult?.analysis_summary && <p className="text-sm text-gray-500 italic mt-2">{matchResult.analysis_summary}</p>}
            {matchResult && !wf.interviewQuestions && (
              <button className="btn-primary text-sm mt-3" onClick={()=>setTab("interview")}>💡 去生成面试题 →</button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">选择岗位或手动输入JD进行匹配分析：</p>
            <div className="flex gap-1 bg-gray-100 rounded p-0.5 w-fit">
              <button className={`text-xs px-3 py-1 rounded ${parseMode==="select"?"bg-white shadow font-medium":"text-gray-500"}`} onClick={()=>setParseMode("select")}>选择岗位</button>
              <button className={`text-xs px-3 py-1 rounded ${parseMode==="manual"?"bg-white shadow font-medium":"text-gray-500"}`} onClick={()=>setParseMode("manual")}>手动输入JD</button>
            </div>
            {parseMode==="select" ? (
              <div className="flex gap-2">
                <select className="input-field text-sm flex-1" value={matchJobId} onChange={e=>setMatchJobId(e.target.value)}>
                  <option value="">选择岗位...</option>
                  {jobs.map((j:any)=><option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
                <button className="btn-primary text-sm" onClick={handleManualMatch} disabled={matching||!matchJobId}>
                  {matching ? "分析中..." : "🎯 匹配分析"}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea className="input-field h-24 text-sm" placeholder="粘贴岗位JD文本..." value={manualJD} onChange={e=>setManualJD(e.target.value)} />
                <button className="btn-primary text-sm" onClick={handleManualMatch} disabled={matching||manualJD.trim().length<10}>
                  {matching ? "解析匹配中..." : "🎯 解析JD并匹配"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>)}

    {/* 面试题 Tab */}
    {tab==="interview" && (<div className="card">
      <h3 className="font-semibold mb-3">💬 面试建议题</h3>
      {wf.interviewQuestions?.length>0 ? (
        <ol className="list-decimal pl-5 space-y-2 text-sm">{wf.interviewQuestions.map((q:any,i:number)=><li key={i} className="text-gray-800">{typeof q==="string"?q:(q.question||q.topic||"")}</li>)}</ol>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">{candidate.matchRating||matchResult ? "已有匹配结果，可以生成面试题：" : "请先在JD匹配Tab完成匹配分析"}</p>
          {(candidate.matchRating||matchResult) && (
            <button className="btn-primary text-sm" onClick={handleGenInterview} disabled={generatingIQ}>
              {generatingIQ ? "生成中..." : "💡 生成面试题"}
            </button>
          )}
        </div>
      )}
    </div>)}
  </div>);
}
