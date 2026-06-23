"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { parseJD, executeSearch, getSearchStatus, getSearchResults, analyzeMatch, getDecisionRecommendations, bindTalentToJob, TalentListItem } from "@/lib/api";
import type { JobRequirement, Candidate, MatchResult, DecisionItem, DecisionStats } from "@/lib/api";
import { ratingColor, decisionLabel, formatScore } from "@/lib/utils";

const CITIES = ["北京","上海","广州","深圳","杭州","成都","南京","武汉","西安","苏州","重庆","长沙","天津","郑州","青岛","合肥","厦门","福州","大连","济南","宁波","无锡","东莞","佛山","珠海","昆明","贵阳","南宁","海口","石家庄","哈尔滨","长春","沈阳","太原","兰州","乌鲁木齐","呼和浩特","银川","西宁","拉萨","南昌"];
type Step = "jd" | "search" | "matching" | "result";
const WF_KEY = "recruit_workflow";
const JOBS_KEY = "recruit_jobs_list";
const JOBS_DATA_KEY = "recruit_jobs_data";
const CANDIDATES_KEY = "recruit_candidates";

function loadState() { try { const r = localStorage.getItem(WF_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function saveState(s: Record<string, any>) { try { localStorage.setItem(WF_KEY, JSON.stringify(s)); } catch {} }

export default function WorkflowPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);

  const [step, setStep] = useState<Step>("jd");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{text:string;type:"info"|"error"|"success"}|null>(null);
  const showToast = (text: string, type: "info"|"error"|"success"="info") => { setToast({text,type}); setTimeout(()=>setToast(null),4000); };
  const [jdText, setJdText] = useState("");
  const [jdResult, setJdResult] = useState<JobRequirement | null>(null);
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("上海");
  const [platform, setPlatform] = useState("liepin");
  const [candidates, setCandidates] = useState<TalentListItem[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [searchStatus, setSearchStatus] = useState("");
  const [searchDone, setSearchDone] = useState(false);
  const [matchedList, setMatchedList] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [decStats, setDecStats] = useState<DecisionStats | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [matchPage, setMatchPage] = useState(1);
  const MATCH_PAGE_SIZE = 10;
  const [interviewQ, setInterviewQ] = useState<Record<string, string[]>>({});
  const [interviewedIds, setInterviewedIds] = useState<Set<string>>(new Set());
  const [savedToCandidates, setSavedToCandidates] = useState<Set<string>>(new Set());
  const [taskId, setTaskId] = useState<string | null>(null);

  // 客户端加载 localStorage 状态
  useEffect(() => {
    const init = loadState() || {};
    if (init.step) setStep(init.step);
    if (init.jdText) setJdText(init.jdText);
    if (init.jdResult) setJdResult(init.jdResult);
    if (init.keywords) setKeywords(init.keywords);
    if (init.location) setLocation(init.location);
    if (init.platform) setPlatform(init.platform);
    if (init.candidates?.length) setCandidates(init.candidates);
    if (init.savedIds?.length) setSavedIds(new Set(init.savedIds));
    if (init.selected?.length) setSelected(new Set(init.selected));
    if (init.decStats) setDecStats(init.decStats);
    if (init.interviewQ) setInterviewQ(init.interviewQ);
    if (init.interviewedIds?.length) setInterviewedIds(new Set(init.interviewedIds));
    if (init.savedToCandidates?.length) setSavedToCandidates(new Set(init.savedToCandidates));
    setLoaded(true);
  }, []);
  const platformName = platform === "liepin" ? "猎聘" : "BOSS直聘";

  useEffect(() => {
    if (!loaded) return;
    saveState({ step, jdText, jdResult, keywords, location, platform,
      savedIds: Array.from(savedIds),
      decisions, decStats, savedToCandidates: Array.from(savedToCandidates),
      interviewQ, interviewedIds: Array.from(interviewedIds) });
  }, [step, jdText, jdResult, keywords, location, platform, candidates, selected, savedIds, decisions, decStats, savedToCandidates, matchedList, taskId, interviewQ, interviewedIds]);

  // ── Step 1: JD ──
  const handleParse = async () => {
    if (jdText.trim().length < 2) { showToast("请输入职位描述","error"); return; }
    setBusy(true);
    try {
      const r = await parseJD(jdText);
      setJdResult(r);
      const skills = r.iceberg_above.skills?.slice(0, 2).map((s: any) => s.description.split(/[，,、\s]/)[0]).join(",") || "";
      setKeywords([r.title, skills].filter(Boolean).join(","));
      setStep("search"); showToast("JD解析完成","success");
    } catch (e: any) { showToast(e.message || "JD解析失败","error"); }
    finally { setBusy(false); }
  };

  const saveJDToJobs = () => {
    if (!jdResult) return;
    const list = JSON.parse(localStorage.getItem(JOBS_KEY) || "[]");
    const exists = list.find((j: any) => j.id === jdResult.id);
    if (!exists) {
      list.unshift({ id: jdResult.id, title: jdResult.title, coreCount: jdResult.core_requirements?.length || 0, importantCount: jdResult.important_requirements?.length || 0, bonusCount: jdResult.bonus_requirements?.length || 0, notes: "", createdAt: new Date().toISOString() });
      localStorage.setItem(JOBS_KEY, JSON.stringify(list));
      const data = JSON.parse(localStorage.getItem(JOBS_DATA_KEY) || "{}");
      data[jdResult.id] = jdResult; localStorage.setItem(JOBS_DATA_KEY, JSON.stringify(data));
    }
    showToast("已存入职位管理","success");
  };

  // ── Step 2: Search ──
  const handleSearchClick = () => { if (!keywords.trim()) { showToast("请输入搜索关键词","error"); return; } setShowLoginModal(true); };

  const confirmAndSearch = async () => {
    setShowLoginModal(false); setBusy(true); setCandidates([]); setSearchDone(false); setSearchStatus("启动中...");
    try {
      const kw = keywords.split(/[,;，；\s]+/).filter(Boolean);
      const result = await executeSearch({ platform, keywords: kw, location, job_id: jdResult?.id, max_pages: 5 });
      setTaskId(result.task_id); setSearchStatus("搜索中...");
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const status = await getSearchStatus(result.task_id);
          if (status.progress?.scraping) setSearchStatus(status.progress.scraping);
          else if (status.progress?.pages) setSearchStatus(`搜索第${status.progress.pages}页, 已发现${status.result_count}人`);
          if (status.status === "completed" || status.status === "failed" || attempts > 200) {
            clearInterval(poll); setBusy(false); setSearchStatus("");
            if (status.status === "completed") {
              if (status.result_count > 0) {
                const list = await getSearchResults(result.task_id);
                console.log("[search] got results:", list.length, "candidates, task:", result.task_id);
                setCandidates(list.length > 0 ? list : []); setSearchDone(true);
                showToast(`搜索完成！找到 ${list.length} 人`,"success");
              } else { setSearchDone(true); showToast("搜索完成，未找到候选人","error"); }
            } else if (attempts > 60) showToast("搜索超时","error");
            else showToast("搜索失败: " + (status.error_message || ""),"error");
          }
        } catch { clearInterval(poll); setBusy(false); }
      }, 3000);
    } catch (e: any) { showToast(e.message || "搜索启动失败","error"); setBusy(false); }
  };

  const handleSaveToTalent = async () => {
    if (selected.size === 0 || !jdResult) return;
    setBusy(true);
    try {
      await bindTalentToJob(Array.from(selected), jdResult.id);
      setSavedIds(new Set([...Array.from(savedIds), ...Array.from(selected)]));
      showToast(`已绑定 ${selected.size} 人到岗位`,"success");
    } catch (e: any) { showToast("绑定失败: " + (e.message || ""),"error"); }
    finally { setBusy(false); }
  };

  // ── Step 3: Match ──
  const handleMatch = async () => {
    if (!jdResult || selected.size === 0) return;
    setBusy(true); showToast("AI 分析中...","info");
    try {
      const tids = Array.from(selected);
      const results = await analyzeMatch(jdResult.id, tids);
      const newItems = candidates.filter(c => selected.has(c.id)).map(c => {
        const match = results.find((r: any) => String(r.candidate_id) === String(c.id)) || null;
        return { ...c, match };
      });
      const existingIds = new Set(newItems.map(x => x.id));
      const kept = matchedList.filter(x => !existingIds.has(x.id));
      const merged = [...kept, ...newItems].sort((a, b) => (b.match?.overall_score || 0) - (a.match?.overall_score || 0));
      setMatchedList(merged);
      setStep("result"); showToast("匹配分析完成","success");
      try { const d = await getDecisionRecommendations(jdResult.id, tids); setDecisions(d.decisions); setDecStats(d.stats); } catch {}
    } catch (e: any) { showToast(e.message || "匹配分析失败","error"); }
    finally { setBusy(false); }
  };

  // ── Step 4: Interview ──
  const handleInterview = async (talentId: string) => {
    if (!jdResult) return;
    setBusy(true);
    try {
      const { confirmInterview } = await import("@/lib/api");
      const talent = await confirmInterview(talentId, { job_id: jdResult.id });
      const rawQ = talent.interview_json?.questions || [];
      const questions = rawQ.map((q: any) => typeof q === "string" ? q : (q.question || q.topic || ""));
      if (questions.length > 0) {
        setInterviewQ(prev => ({ ...prev, [talentId]: questions }));
        setInterviewedIds(new Set([...Array.from(interviewedIds), talentId]));
        showToast("面试题已生成","success");
      } else {
        showToast("面试题生成失败: " + (talent.interview_json?.error || "API额度可能已用完"),"error");
      }
    } catch (e: any) { showToast("生成失败: " + (e.message || ""),"error"); }
    finally { setBusy(false); }
  };

  const handleSaveToCandidates = (item: any) => {
    const list = JSON.parse(localStorage.getItem(CANDIDATES_KEY) || "[]");
    if (!list.find((c: any) => c.id === item.id)) {
      list.unshift({
        id: item.id, name: item.name || "未知", currentTitle: item.current_title || "", currentCompany: item.current_company || "",
        experienceYears: item.experience_years || null, education: item.education || "", school: item.school || "",
        skills: item.skills || [], industryTags: item.industry_tags || [], sourcePlatform: item.source_platform || "工作台",
        notes: `岗位: ${jdResult?.title || ""} | 评级: ${item.match?.rating || ""} | 分数: ${item.match?.overall_score || ""}`,
        createdAt: new Date().toISOString(), jobId: jdResult?.id,
        matchScore: item.match?.overall_score, matchRating: item.match?.rating,
        workflowInfo: { jdTitle: jdResult?.title, matchedPoints: item.match?.matched_points, gapPoints: item.match?.gap_points, interviewQuestions: interviewQ[item.id] },
      });
      localStorage.setItem(CANDIDATES_KEY, JSON.stringify(list));
    }
    setSavedToCandidates(new Set([...Array.from(savedToCandidates), item.id]));
    showToast("已保存至候选人","success");
  };

  const steps = [{ key: "jd" as Step, label: "JD解析", icon: "1" },{ key: "search" as Step, label: "渠道搜索", icon: "2" },{ key: "matching" as Step, label: "匹配分析", icon: "3" },{ key: "result" as Step, label: "决策建议", icon: "4" }];

  return (
    <div className="max-w-5xl space-y-6">
      <div><h2 className="text-2xl font-bold">🚀 招聘全链路工作台</h2><p className="text-sm text-gray-500 mt-1">JD解析 → AI浏览器搜索 → AI匹配 → 面试决策</p></div>

      {/* Toast */}
      {toast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className={`px-6 py-3 rounded-xl shadow-2xl text-sm font-medium animate-pulse pointer-events-auto ${toast.type==="error"?"bg-red-500 text-white":toast.type==="success"?"bg-green-500 text-white":"bg-blue-500 text-white"}`}>
            {toast.text}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm">{steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step === s.key ? "bg-primary-600 text-white" : steps.findIndex(x => x.key === step) > i ? "bg-green-500 text-white" : "bg-gray-200 text-gray-400"}`}>
            {steps.findIndex(x => x.key === step) > i ? "✓" : s.icon}</div>
          <span className={step === s.key ? "text-primary-700 font-medium text-xs" : "text-gray-400 text-xs"}>{s.label}</span>
          {i < 3 && <div className="w-6 h-px bg-gray-200" />}
        </div>))}
      </div>

      {searchDone && candidates.length > 0 && <div className="px-4 py-3 rounded text-sm bg-green-50 text-green-700 border border-green-200">✅ 搜索完成！找到 <b>{candidates.length}</b> 位候选人。勾选后入库或匹配分析。</div>}

      {/* Login modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/50" onClick={() => setShowLoginModal(false)} /><div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 z-10">
          <h3 className="text-lg font-semibold mb-3">🔐 即将打开 {platformName}</h3>
          <div className="text-sm text-gray-600 space-y-2 mb-5"><p>AI 浏览器将打开 <b>{platformName}</b>。</p><p>1. 如未登录请<b>扫码登录</b></p><p>2. 在搜索框中输入关键词并<b>点击搜索</b></p><p>3. 设置筛选条件（城市/经验等）</p><p className="text-orange-600 font-medium">25秒后自动开始抓取。请在此之前完成搜索操作。</p></div>
          <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setShowLoginModal(false)}>取消</button><button className="btn-primary" onClick={confirmAndSearch}>确认</button></div>
        </div></div>
      )}
      {searchStatus && <div className="card bg-blue-50 border-blue-200"><div className="flex items-center gap-3"><span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /><p className="text-sm text-blue-700">{searchStatus}</p></div></div>}

      {/* Step 1: JD */}
      <div className={`card ${step==="jd"?"ring-2 ring-primary-300":""}`}>
        <h3 className="font-semibold mb-2">📋 第一步：输入职位描述</h3>
        <textarea className="input-field h-28 text-sm resize-y" value={jdText} onChange={e => setJdText(e.target.value)} disabled={busy} placeholder="粘贴JD文本..." />
        <div className="flex items-center gap-3 mt-2">
          <button className="btn-primary text-sm" onClick={handleParse} disabled={busy || jdText.trim().length < 2}>{busy&&step==="jd"?"⏳":"🤖"} AI 解析 JD</button>
          {jdResult && <span className="text-xs text-green-600">✅ {jdResult.title}</span>}
          {jdResult && <button className="btn-secondary text-xs" onClick={saveJDToJobs}>💰 存入职位管理</button>}
          {jdResult && <button className="text-xs text-primary-600 underline" onClick={() => router.push(`/jobs/${jdResult.id}`)}>📋 查看此岗位</button>}
        </div>
        {jdResult && <div className="mt-3 p-2 bg-gray-50 rounded text-xs grid grid-cols-3 gap-2"><span>知识: {jdResult.iceberg_above.knowledge.length}</span><span>技能: {jdResult.iceberg_above.skills.length}</span><span>经验: {jdResult.iceberg_above.experience.length}</span><span>核心: {jdResult.core_requirements.length}</span><span>重要: {jdResult.important_requirements.length}</span><span>加分: {jdResult.bonus_requirements.length}</span></div>}
      </div>

      {/* Step 2: Search */}
      {(step==="search"||step==="matching"||step==="result") && (
        <div className={`card ${step==="search"?"ring-2 ring-primary-300":""}`}>
          <h3 className="font-semibold mb-2">🔍 第二步：AI 浏览器搜索</h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="text-xs text-gray-500">平台</label><select className="input-field text-sm" value={platform} onChange={e=>setPlatform(e.target.value)} disabled={busy}><option value="liepin">猎聘</option><option value="bosszhipin">BOSS直聘</option></select></div>
            <div className="col-span-2"><label className="text-xs text-gray-500">关键词</label><input className="input-field text-sm" value={keywords} onChange={e=>setKeywords(e.target.value)} disabled={busy} /></div>
            <div><label className="text-xs text-gray-500">城市</label><select className="input-field text-sm" value={location} onChange={e=>setLocation(e.target.value)} disabled={busy}>{CITIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          <div className="flex gap-2 mb-3 text-xs text-gray-400">
            <a href={`https://www.liepin.com/zhaopin/?key=${encodeURIComponent(keywords||"Java")}`} target="_blank" className="hover:text-primary-600 underline">🔗 手动猎聘</a>
            <a href={`https://www.zhipin.com/web/geek/job?query=${encodeURIComponent(keywords||"Java")}`} target="_blank" className="hover:text-primary-600 underline">🔗 手动BOSS</a>
          </div>
          <button className="btn-primary text-sm" onClick={handleSearchClick} disabled={busy||!keywords.trim()}>{busy?"⏳":"🔍"} 搜索 {platformName}</button>

          {candidates.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{candidates.length} 人</span>
                <div className="flex gap-2">
                  <button className="text-xs text-primary-600" onClick={()=>setSelected(new Set(candidates.map(c=>c.id)))}>全选</button>
                  <button className="text-xs text-gray-400" onClick={()=>setSelected(new Set())}>取消</button>
                  <button className="btn-primary text-xs py-1 px-3" onClick={handleSaveToTalent} disabled={busy||selected.size===0}>💰 选中入库 ({selected.size})</button>
                  <button className="btn-primary text-xs py-1 px-3" onClick={handleMatch} disabled={busy||selected.size===0}>📊 匹配分析 ({selected.size})</button>
                </div>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {candidates.map(c => (
                  <label key={c.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-gray-50 text-sm ${selected.has(c.id)?"border-primary-300 bg-primary-50":"border-gray-200"}`}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={()=>{const n=new Set(selected);selected.has(c.id)?n.delete(c.id):n.add(c.id);setSelected(n);}} />
                    <span className="font-medium w-16 truncate">{c.name||"?"}</span>
                    <span className="text-gray-400 truncate flex-1">{c.current_title||""}</span>
                    <span className="text-xs text-gray-400">{c.experience_years}年</span>
                    <span className="text-xs text-gray-400">{c.education||""}</span>
                    {c.source_url && <a href={c.source_url} target="_blank" className="text-xs text-blue-500 hover:underline shrink-0" onClick={e=>e.stopPropagation()} title="查看原简历">🔗</a>}
                    {savedIds.has(c.id) && <span className="text-xs text-green-600">✅已入库</span>}
                    {matchedList.some(x=>x.id===c.id&&x.match) && <span className="text-xs text-purple-600 font-medium">已分析</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3 & 4: Match Results */}
      {step==="result" && matchedList.length > 0 && (
        <div className="card ring-2 ring-green-300">
          <h3 className="font-semibold mb-3">📊 匹配结果 & 决策建议</h3>
          {/* 从匹配列表直接计算 SABC 统计，不依赖决策API */}
          {matchedList.length > 0 && (() => {
            const total = matchedList.length;
            const s = matchedList.filter(x => x.match?.rating === "S").length;
            const a = matchedList.filter(x => x.match?.rating === "A").length;
            const b = matchedList.filter(x => x.match?.rating === "B").length;
            const c = matchedList.filter(x => x.match?.rating === "C").length;
            const interview = s + a;
            return (<div className="grid grid-cols-7 gap-2 mb-4 text-center text-xs">
              {[{l:"总计",v:total},{l:"S",v:s,c:"text-purple-600"},{l:"A",v:a,c:"text-green-600"},{l:"B",v:b,c:"text-yellow-600"},{l:"C",v:c,c:"text-red-500"},{l:"面试",v:interview,c:"text-blue-600"},{l:"备选",v:b,c:"text-orange-500"}].map(x=><div key={x.l} className="bg-gray-50 rounded p-1"><b className={x.c||""}>{x.v}</b><br/>{x.l}</div>)}
            </div>);
          })()}

          <div className="space-y-2">
            {matchedList.slice((matchPage - 1) * MATCH_PAGE_SIZE, matchPage * MATCH_PAGE_SIZE).map((item: any, i: number) => {
              const m = item.match;
              const expanded = expandedId === String(item.id);
              const isInterviewed = interviewedIds.has(item.id);
              const isSaved = savedToCandidates.has(item.id);
              return (
                <div key={item.id}>
                  <div className={`border rounded-lg p-3 cursor-pointer hover:shadow transition-shadow ${expanded?"border-primary-300 bg-primary-50":""}`}
                    onClick={() => setExpandedId(expanded ? null : String(item.id))}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400 w-5">{i+1}</span>
                        {m?.rating && <span className={`px-3 py-1 rounded-lg text-sm font-bold ${ratingColor(m.rating)}`}>{m.rating} 级</span>}
                        <span className="font-medium">{item.name||"?"}</span>
                        <span className="text-sm text-gray-500">{item.current_title||""}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {m?.overall_score != null && <span className="font-bold text-lg">{formatScore(m.overall_score)}</span>}
                        {m?.decision && <span className={`text-xs px-2 py-0.5 rounded ${m.decision==="interview"?"bg-green-100 text-green-700":m.decision==="backup"?"bg-yellow-100 text-yellow-700":"bg-red-100 text-red-700"}`}>{decisionLabel(m.decision)}</span>}
                        {isInterviewed ? <span className="text-xs text-green-600 font-medium">✅已邀约</span> : <button className="btn-primary text-xs py-0.5 px-2" onClick={e=>{e.stopPropagation();handleInterview(item.id);}} disabled={busy}>✅邀约面试</button>}
                        {isSaved ? <span className="text-xs text-green-600 font-medium">✅已保存</span> : <button className="btn-secondary text-xs py-0.5 px-2" onClick={e=>{e.stopPropagation();handleSaveToCandidates(item);}}>📥保存至候选人</button>}
                        <button className="text-xs text-red-400 hover:text-red-600 ml-1" onClick={e=>{e.stopPropagation();setMatchedList(prev=>prev.filter(x=>x.id!==item.id));}} title="移除">✕</button>
                      </div>
                    </div>
                    {m && <div className="grid grid-cols-3 gap-1 mt-1 text-xs text-gray-400"><span>硬性:{formatScore(m.hard_score)}</span><span>软性:{formatScore(m.soft_score)}</span><span>加分:{formatScore(m.bonus_score)}</span></div>}
                  </div>
                  {expanded && m && (
                    <div className="border-x border-b rounded-b-lg p-4 bg-white -mt-px ml-4">
                      <div className="flex items-center gap-3 mb-3">
                        {m.rating && <span className={`px-4 py-1.5 rounded-xl text-lg font-bold ${ratingColor(m.rating)}`}>{m.rating} 级</span>}
                        <span className="text-2xl font-bold">{formatScore(m.overall_score)}</span>
                        <span className="text-xs text-gray-400">H:{formatScore(m.hard_score)} S:{formatScore(m.soft_score)} B:{formatScore(m.bonus_score)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {m.matched_points?.length>0&&<div><p className="text-xs font-medium text-green-600 mb-1">✅ 匹配点</p>{m.matched_points.map((p:string,j:number)=><p key={j} className="text-xs text-gray-600">· {p}</p>)}</div>}
                        {m.gap_points?.length>0&&<div><p className="text-xs font-medium text-red-500 mb-1">⚠️ 差距点</p>{m.gap_points.map((p:string,j:number)=><p key={j} className="text-xs text-gray-600">· {p}</p>)}</div>}
                      </div>
                      {m.analysis_summary&&<p className="text-xs text-gray-500 mt-2 italic">{m.analysis_summary}</p>}
                      {interviewQ[item.id]?.length>0&&<div className="mt-2 pt-2 border-t"><p className="text-xs font-medium text-primary-600 mb-1">🎯 面试建议题</p>{interviewQ[item.id].map((q:any,j:number)=><p key={j} className="text-xs text-gray-700">{j+1}. {typeof q==="string"?q:(q.question||q.topic||"")}</p>)}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 匹配结果翻页 */}
          {(() => {
            const totalMatchPages = Math.ceil(matchedList.length / MATCH_PAGE_SIZE);
            if (totalMatchPages <= 1) return null;
            return (
              <div className="flex items-center justify-center gap-3 mt-4 pt-3 border-t">
                <button className="btn-secondary text-xs px-3 py-1" disabled={matchPage <= 1} onClick={() => setMatchPage(p => p - 1)}>← 上一页</button>
                <span className="text-sm text-gray-500">第 {matchPage}/{totalMatchPages} 页 · 共 {matchedList.length} 人</span>
                <button className="btn-secondary text-xs px-3 py-1" disabled={matchPage >= totalMatchPages} onClick={() => setMatchPage(p => p + 1)}>下一页 →</button>
              </div>
            );
          })()}
        </div>
      )}

      <div className="text-center pb-8">
        <button className="text-sm text-gray-400 underline" onClick={()=>{setStep("jd");setJdResult(null);setCandidates([]);setMatchedList([]);setDecisions([]);setDecStats(null);setSearchDone(false);setSavedIds(new Set());setSelected(new Set());setInterviewedIds(new Set());setInterviewQ({});localStorage.removeItem(WF_KEY);}}>🔄 重新开始</button>
      </div>
    </div>
  );
}
