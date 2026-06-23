"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { parseJD, createCandidate, analyzeMatch, getDecisionRecommendations, analyzeResume, JobRequirement, MatchResult, DecisionItem, DecisionStats, ResumeAnalysis } from "@/lib/api";
import { ratingColor, decisionLabel, formatScore } from "@/lib/utils";

// ── 类型 ──

interface CandidateRecord {
  id: string;
  name: string;
  currentTitle: string;
  currentCompany: string;
  experienceYears: number | null;
  education: string;
  school: string;
  skills: string[];
  industryTags: string[];
  sourcePlatform: string;
  notes: string;
  createdAt: string;
  aiAnalysis?: ResumeAnalysis;
  jobId?: string;
  matchScore?: number;
  matchRating?: string;
  workflowInfo?: any;
}

interface CandidateModal {
  mode: "add" | "edit";
  id?: string;
  name: string;
  currentTitle: string;
  currentCompany: string;
  experienceYears: string;
  education: string;
  school: string;
  skillsText: string;
  industryTagsText: string;
  sourcePlatform: string;
  notes: string;
}

interface ReqItem { category: string; description: string; priority: string; weight: number; type?: string; }
interface FileProcessStatus { panel: "jd" | "resume"; status: string; progress?: number; }

// ── 文件处理 ──

async function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || "");
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsText(file);
  });
}

async function extractPDFText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => item.str).join(" "));
  }
  return pages.join("\n\n");
}

async function extractImageText(file: File, onProgress: (p: number) => void): Promise<string> {
  const Tesseract = (await import("tesseract.js")).default;
  const result = await Tesseract.recognize(file, "chi_sim+eng", {
    logger: (info) => { if (info.status === "recognizing text" && info.progress) { onProgress(Math.round(info.progress * 100)); } },
  });
  return result.data.text;
}

async function processFile(file: File, setStatus: (s: string) => void, onOcr?: (p: number) => void): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") { setStatus("正在提取 PDF 文本..."); const t = await extractPDFText(file); setStatus(""); if (!t.trim()) throw new Error("PDF 中未检测到文本内容"); return t; }
  if (["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff"].includes(ext || "")) {
    setStatus("正在 OCR 识别中..."); const t = await extractImageText(file, (p) => { setStatus(`OCR 识别中 ${p}%...`); onOcr?.(p); }); setStatus(""); if (!t.trim()) throw new Error("图片中未识别到文字"); return t;
  }
  setStatus("正在读取文件..."); const t = await readTextFile(file); setStatus(""); return t;
}

// ── localStorage ──

const STORAGE_KEY = "recruit_candidates";
function loadCandidates(): CandidateRecord[] { try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : []; } catch { return []; } }
function saveCandidates(list: CandidateRecord[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
function makeId(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// ── 页面 ──

export default function CandidatesPage() {
  const router = useRouter();

  // JD
  const [jdText, setJdText] = useState("");
  const [jdParsing, setJdParsing] = useState(false);
  const [jdResult, setJdResult] = useState<JobRequirement | null>(null);
  const [jdError, setJdError] = useState<string | null>(null);

  // 简历
  const [resumeText, setResumeText] = useState("");
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [aiAnalysing, setAiAnalysing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<ResumeAnalysis | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // 文件
  const [fileStatus, setFileStatus] = useState<FileProcessStatus | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);

  // 匹配
  const [matching, setMatching] = useState(false);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [decStats, setDecStats] = useState<DecisionStats | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);

  // 候选人列表
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [modal, setModal] = useState<CandidateModal | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const jdFileRef = useRef<HTMLInputElement>(null!);
  const resumeFileRef = useRef<HTMLInputElement>(null!);

  useEffect(() => { setCandidates(loadCandidates()); }, []);

  // ── 文件上传 ──
  const handleFile = useCallback(async (file: File, panel: "jd" | "resume") => {
    setOcrProgress(0); setFileStatus({ panel, status: "正在读取文件..." });
    try {
      const text = await processFile(file, (s) => setFileStatus({ panel, status: s }), (p) => { setOcrProgress(p); setFileStatus({ panel, status: `OCR 识别中 ${p}%...`, progress: p }); });
      if (panel === "jd") { setJdText(text); setJdError(null); } else { setResumeText(text); setResumeError(null); }
    } catch (e) { const m = e instanceof Error ? e.message : "文件处理失败"; if (panel === "jd") setJdError(m); else setResumeError(m); }
    finally { setFileStatus(null); setOcrProgress(0); }
  }, []);

  // ── JD 解析 ──
  const handleParseJD = async () => {
    if (!jdText.trim() || jdText.length < 10) { setJdError("请输入至少10个字符的职位描述"); return; }
    setJdParsing(true); setJdError(null); setJdResult(null);
    try { setJdResult(await parseJD(jdText)); } catch (e) { setJdError(e instanceof Error ? e.message : "解析失败"); }
    finally { setJdParsing(false); }
  };

  // ── AI 深度分析 ──
  const handleAiAnalyze = async () => {
    if (!resumeText.trim() || resumeText.length < 10) { setAiError("请输入至少10个字符的简历内容"); return; }
    setAiAnalysing(true); setAiError(null); setAiAnalysis(null);
    try { setAiAnalysis(await analyzeResume(resumeText)); } catch (e) { setAiError(e instanceof Error ? e.message : "AI分析失败，请确认后端服务已启动"); }
    finally { setAiAnalysing(false); }
  };

  // ── AI分析完成后加入列表 ──
  const handleAddFromAnalysis = () => {
    if (!aiAnalysis) return;
    const bi = aiAnalysis.basic_info;
    const jp = aiAnalysis.job_preference;
    const record: CandidateRecord = {
      id: makeId(),
      name: bi.name !== "信息不足" ? bi.name : "未知",
      currentTitle: jp.desired_title !== "信息不足" ? jp.desired_title : "",
      currentCompany: "",
      experienceYears: aiAnalysis.career_trajectory.total_years || null,
      education: aiAnalysis.education.degree !== "信息不足" ? aiAnalysis.education.degree : "",
      school: aiAnalysis.education.school !== "信息不足" ? aiAnalysis.education.school : "",
      skills: [...aiAnalysis.skills.expert, ...aiAnalysis.skills.proficient],
      industryTags: aiAnalysis.skills.categories,
      sourcePlatform: "AI分析",
      notes: aiAnalysis.overall_rating,
      createdAt: new Date().toISOString(),
      aiAnalysis,
    };
    const all = loadCandidates();
    const updated = [record, ...all];
    saveCandidates(updated); setCandidates(updated);
    setAiAnalysis(null); setResumeText(""); setResumeError(null); setAiError(null);
  };

  // ── 匹配分析 ──
  const handleMatch = async () => {
    if (!jdResult || !aiAnalysis) return;
    setMatching(true); setMatchError(null); setMatchResults([]); setDecisions([]); setDecStats(null);
    try {
      const bi = aiAnalysis.basic_info;
      const jp = aiAnalysis.job_preference;
      const { candidate_id } = await createCandidate({
        name: bi.name !== "信息不足" ? bi.name : "未知",
        current_title: jp.desired_title !== "信息不足" ? jp.desired_title : "",
        current_company: "",
        experience_years: aiAnalysis.career_trajectory.total_years || null,
        education: aiAnalysis.education.degree !== "信息不足" ? aiAnalysis.education.degree : "",
        school: aiAnalysis.education.school !== "信息不足" ? aiAnalysis.education.school : "",
        skills: [...aiAnalysis.skills.expert, ...aiAnalysis.skills.proficient],
        industry_tags: aiAnalysis.skills.categories,
        raw_text: resumeText,
      });
      const matchR = await analyzeMatch(jdResult.id, [candidate_id]);
      setMatchResults(matchR);
      try { const d = await getDecisionRecommendations(jdResult.id, [candidate_id]); setDecisions(d.decisions); setDecStats(d.stats); } catch {}
    } catch (e) { setMatchError(e instanceof Error ? e.message : "匹配分析失败，请确认后端服务已启动"); }
    finally { setMatching(false); }
  };

  // ── 候选人 CRUD ──
  const [filterJob, setFilterJob] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const jobs = JSON.parse(localStorage.getItem("recruit_jobs_list") || "[]");

  const filtered = candidates.filter(c => {
    if (filterJob && c.jobId !== filterJob) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [c.name, c.currentTitle, c.currentCompany, ...c.skills].some(s => s?.toLowerCase().includes(q));
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const emptyModal = (): CandidateModal => ({ mode: "add", name: "", currentTitle: "", currentCompany: "", experienceYears: "", education: "", school: "", skillsText: "", industryTagsText: "", sourcePlatform: "", notes: "" });

  const handleEdit = (c: CandidateRecord) => {
    setModal({ mode: "edit", id: c.id, name: c.name, currentTitle: c.currentTitle, currentCompany: c.currentCompany, experienceYears: c.experienceYears?.toString() ?? "", education: c.education, school: c.school, skillsText: c.skills.join(", "), industryTagsText: c.industryTags.join(", "), sourcePlatform: c.sourcePlatform, notes: c.notes });
  };

  const handleModalConfirm = () => {
    if (!modal || !modal.name.trim()) return;
    const existing = candidates.find(c => c.id === modal.id);
    const record: CandidateRecord = {
      id: modal.mode === "add" ? makeId() : modal.id!,
      name: modal.name.trim(), currentTitle: modal.currentTitle.trim(), currentCompany: modal.currentCompany.trim(),
      experienceYears: modal.experienceYears ? parseInt(modal.experienceYears, 10) : null,
      education: modal.education.trim(), school: modal.school.trim(),
      skills: modal.skillsText.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean),
      industryTags: modal.industryTagsText.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean),
      sourcePlatform: modal.sourcePlatform.trim(), notes: modal.notes.trim(),
      createdAt: modal.mode === "add" ? new Date().toISOString() : existing?.createdAt ?? new Date().toISOString(),
      aiAnalysis: existing?.aiAnalysis,
    };
    const all = loadCandidates();
    const updated = modal.mode === "add" ? [record, ...all] : all.map(c => c.id === record.id ? record : c);
    saveCandidates(updated); setCandidates(updated); setModal(null);
  };

  const handleDelete = () => {
    if (!deletingId) return;
    saveCandidates(loadCandidates().filter(c => c.id !== deletingId));
    setCandidates(loadCandidates()); setDeletingId(null);
  };

  // ── 辅助 ──
  const priorityLabel = (p: string) => ({ core: "核心必要", important: "重要优先", bonus: "优先加分" }[p] || p);
  const priorityColor = (p: string) => ({ core: "bg-red-50 text-red-700 border-red-200", important: "bg-orange-50 text-orange-700 border-orange-200", bonus: "bg-blue-50 text-blue-700 border-blue-200" }[p] || "bg-gray-50 text-gray-700 border-gray-200");
  const renderJDItem = (item: ReqItem, i: number) => (
    <div key={i} className="flex items-start gap-2 py-2 border-b last:border-b-0 border-gray-100">
      <span className={`px-1.5 py-0.5 rounded text-xs font-medium border shrink-0 mt-0.5 ${priorityColor(item.priority)}`}>{priorityLabel(item.priority)}</span>
      <div className="min-w-0"><p className="text-sm font-medium text-gray-900">{item.category}</p><p className="text-xs text-gray-600 leading-relaxed">{item.description}</p></div>
    </div>
  );
  const formatDate = (d: string) => new Date(d).toLocaleDateString("zh-CN");
  const isProcessing = fileStatus !== null;
  const isProcessingJd = fileStatus?.panel === "jd";
  const isProcessingResume = fileStatus?.panel === "resume";

  const FileButton = ({ inputRef, panel }: { inputRef: React.RefObject<HTMLInputElement>; panel: "jd" | "resume" }) => (
    <>
      <input ref={inputRef} type="file" accept=".txt,.md,.json,.html,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tiff" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f, panel); if (inputRef.current) inputRef.current.value = ""; }} disabled={isProcessing} />
      <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={() => inputRef.current?.click()} disabled={isProcessing}>📁 上传文件</button>
    </>
  );

  const hasAbove = jdResult && (jdResult.iceberg_above.knowledge.length + jdResult.iceberg_above.skills.length + jdResult.iceberg_above.experience.length) > 0;
  const hasBelow = jdResult && (jdResult.iceberg_below.traits.length + jdResult.iceberg_below.competencies.length + jdResult.iceberg_below.motivations.length) > 0;

  // ── render ──

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-gray-900">候选人</h2><p className="text-sm text-gray-500 mt-1">AI深度分析简历 · 匹配岗位JD · 候选人管理</p></div>

      {/* ═══ JD + 简历 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* JD 面板 */}
        <div className="card">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">📄 岗位 JD</h3>
          <textarea className="input-field h-32 resize-y text-sm" placeholder="粘贴岗位JD文本..." value={jdText} onChange={e => setJdText(e.target.value)} disabled={isProcessing} />
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <FileButton inputRef={jdFileRef} panel="jd" />
            <button className="btn-primary text-xs py-1.5 px-3" onClick={handleParseJD} disabled={jdParsing || jdText.length < 10 || isProcessing}>{jdParsing ? "解析中..." : "🤖 AI解析JD"}</button>
            <span className="text-xs text-gray-400">粘贴 / .txt / .md / .pdf / .png / .jpg</span>
          </div>
          {jdError && <p className="text-xs text-red-500 mt-1">{jdError}</p>}
          {isProcessingJd && (<div className="mt-2"><div className="flex items-center gap-2 text-xs text-blue-600"><span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />{fileStatus.status}</div>{ocrProgress > 0 && (<div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${ocrProgress}%` }} /></div>)}</div>)}
          {jdResult && (
            <div className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100 text-sm">
              <p className="font-semibold">{jdResult.title}</p>
              <div className="mt-2 max-h-72 overflow-y-auto space-y-0">
                {hasAbove && (<details open className="mb-2"><summary className="text-xs font-medium text-gray-600 cursor-pointer">🏔️ 冰山上（显性要求）</summary><div className="mt-1 pl-1">{jdResult.iceberg_above.knowledge.map((x, i) => renderJDItem({ ...x, type: "知识" }, i))}{jdResult.iceberg_above.skills.map((x, i) => renderJDItem({ ...x, type: "技能" }, i))}{jdResult.iceberg_above.experience.map((x, i) => renderJDItem({ ...x, type: "经验" }, i))}</div></details>)}
                {hasBelow && (<details className="mb-2"><summary className="text-xs font-medium text-gray-600 cursor-pointer">🌊 冰山下（隐性要求）</summary><div className="mt-1 pl-1">{jdResult.iceberg_below.traits.map((x, i) => renderJDItem({ ...x, type: "特质" }, i))}{jdResult.iceberg_below.competencies.map((x, i) => renderJDItem({ ...x, type: "素养" }, i))}{jdResult.iceberg_below.motivations.map((x, i) => renderJDItem({ ...x, type: "动机" }, i))}</div></details>)}
                {(jdResult.core_requirements?.length > 0 || jdResult.important_requirements?.length > 0 || jdResult.bonus_requirements?.length > 0) && (<details className="mb-2"><summary className="text-xs font-medium text-gray-600 cursor-pointer">📊 优先级汇总（核心{jdResult.core_requirements?.length || 0} / 重要{jdResult.important_requirements?.length || 0} / 加分{jdResult.bonus_requirements?.length || 0}）</summary><div className="mt-1 pl-1">{jdResult.core_requirements?.map(renderJDItem)}{jdResult.important_requirements?.map(renderJDItem)}{jdResult.bonus_requirements?.map(renderJDItem)}</div></details>)}
              </div>
            </div>
          )}
        </div>

        {/* 简历面板 */}
        <div className="card">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">👤 候选人简历</h3>
          <textarea className="input-field h-32 resize-y text-sm" placeholder="粘贴候选人简历文本..." value={resumeText} onChange={e => setResumeText(e.target.value)} disabled={isProcessing} />
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <FileButton inputRef={resumeFileRef} panel="resume" />
            <button className="btn-primary text-xs py-1.5 px-3 bg-purple-600 hover:bg-purple-700" onClick={handleAiAnalyze} disabled={aiAnalysing || resumeText.length < 10 || isProcessing}>
              {aiAnalysing ? "分析中..." : "🤖 AI 深度分析"}
            </button>
            <span className="text-xs text-gray-400">粘贴 / .txt / .md / .pdf / .png / .jpg</span>
          </div>
          {resumeError && <p className="text-xs text-red-500 mt-1">{resumeError}</p>}
          {aiError && <p className="text-xs text-red-500 mt-1">{aiError}</p>}
          {isProcessingResume && (<div className="mt-2"><div className="flex items-center gap-2 text-xs text-green-600"><span className="inline-block w-3 h-3 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />{fileStatus.status}</div>{ocrProgress > 0 && (<div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full transition-all duration-300" style={{ width: `${ocrProgress}%` }} /></div>)}</div>)}

          {/* ── AI 深度分析报告 ── */}
          {aiAnalysis && (
            <div className="mt-3 p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-100 text-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-purple-800">🤖 AI 深度分析报告</p>
                <button className="btn-success text-xs py-1 px-3 rounded-md" onClick={handleAddFromAnalysis}>➕ 加入列表</button>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="p-2 bg-white/70 rounded text-xs"><span className="font-medium text-gray-600">基本信息：</span><span>{[aiAnalysis.basic_info.name, aiAnalysis.basic_info.gender, aiAnalysis.basic_info.age_range, aiAnalysis.basic_info.city].filter(Boolean).join(" · ") || "—"}</span></div>
                <div className="p-2 bg-white/70 rounded text-xs"><span className="font-medium text-gray-600">求职意向：</span><span>{[aiAnalysis.job_preference.desired_title, aiAnalysis.job_preference.expected_salary].filter(Boolean).join(" · ") || "—"}</span></div>
              </div>
              <details className="mb-2"><summary className="text-xs font-medium text-gray-600 cursor-pointer">🎓 教育背景</summary><div className="mt-1 p-2 bg-white/70 rounded text-xs">{aiAnalysis.education.degree && <span>{aiAnalysis.education.degree} · </span>}{aiAnalysis.education.school && <span>{aiAnalysis.education.school} · </span>}{aiAnalysis.education.major && <span>{aiAnalysis.education.major}</span>}{!aiAnalysis.education.degree && <span className="text-gray-400">信息不足</span>}</div></details>
              {aiAnalysis.work_experience.length > 0 && (<details className="mb-2"><summary className="text-xs font-medium text-gray-600 cursor-pointer">💼 工作经历（{aiAnalysis.work_experience.length}段）</summary><div className="mt-1 space-y-1.5 max-h-52 overflow-y-auto">{aiAnalysis.work_experience.map((we, i) => (<div key={i} className="p-2 bg-white/70 rounded text-xs"><p className="font-medium">{we.start_date} - {we.end_date} | {we.company} | {we.title}</p><p className="text-gray-500">时长：{we.duration}</p>{we.responsibilities.length > 0 && <ul className="list-disc pl-4 mt-0.5 text-gray-700">{we.responsibilities.slice(0, 3).map((r, j) => <li key={j}>{r}</li>)}</ul>}{we.achievements.length > 0 && <p className="text-green-700 mt-0.5">🏆 {we.achievements.slice(0, 2).join("；")}</p>}</div>))}</div></details>)}
              <details className="mb-2"><summary className="text-xs font-medium text-gray-600 cursor-pointer">🛠️ 技能体系</summary><div className="mt-1 p-2 bg-white/70 rounded text-xs space-y-1">{aiAnalysis.skills.expert.length > 0 && <p><span className="font-medium text-purple-700">精通：</span>{aiAnalysis.skills.expert.join("、")}</p>}{aiAnalysis.skills.proficient.length > 0 && <p><span className="font-medium text-blue-700">熟练：</span>{aiAnalysis.skills.proficient.join("、")}</p>}{aiAnalysis.skills.familiar.length > 0 && <p><span className="font-medium text-gray-600">了解：</span>{aiAnalysis.skills.familiar.join("、")}</p>}</div></details>
              {aiAnalysis.career_trajectory.total_years > 0 && (<details className="mb-2"><summary className="text-xs font-medium text-gray-600 cursor-pointer">📈 职业轨迹</summary><div className="mt-1 p-2 bg-white/70 rounded text-xs"><div className="flex gap-3 flex-wrap"><span>总年限：<b>{aiAnalysis.career_trajectory.total_years}年</b></span><span>公司数：<b>{aiAnalysis.career_trajectory.company_count}</b></span><span>平均在职：<b>{aiAnalysis.career_trajectory.avg_tenure_months}个月</b></span><span className={`font-medium ${aiAnalysis.career_trajectory.stability_score >= 80 ? "text-green-600" : aiAnalysis.career_trajectory.stability_score >= 60 ? "text-yellow-600" : "text-red-500"}`}>稳定度：<b>{aiAnalysis.career_trajectory.stability_score}分</b></span></div>{aiAnalysis.career_trajectory.promotion_path.length > 0 && <p className="mt-1">晋升：{aiAnalysis.career_trajectory.promotion_path.join(" → ")}</p>}<p className="text-gray-500 mt-0.5">{aiAnalysis.career_trajectory.stability_assessment}</p></div></details>)}
              <div className="grid grid-cols-2 gap-2 mb-2">
                {aiAnalysis.strengths.length > 0 && (<div className="p-2 bg-green-50/80 rounded text-xs"><p className="font-medium text-green-700 mb-1">✅ 核心优势</p><ul className="list-disc pl-4 space-y-0.5">{aiAnalysis.strengths.map((s, i) => <li key={i} className="text-gray-700">{s}</li>)}</ul></div>)}
                {aiAnalysis.weaknesses.length > 0 && (<div className="p-2 bg-red-50/80 rounded text-xs"><p className="font-medium text-red-600 mb-1">⚠️ 潜在风险</p><ul className="list-disc pl-4 space-y-0.5">{aiAnalysis.weaknesses.map((w, i) => <li key={i} className="text-gray-700">{w}</li>)}</ul></div>)}
              </div>
              <div className="p-2 bg-white/70 rounded text-xs mb-1"><span className="font-medium">🏆 综合评级：</span><span className="text-purple-700 font-semibold">{aiAnalysis.overall_rating}</span></div>
              {aiAnalysis.development_advice.length > 0 && (<div className="p-2 bg-white/70 rounded text-xs"><p className="font-medium mb-1">💡 发展建议：</p><ol className="list-decimal pl-4 space-y-0.5">{aiAnalysis.development_advice.map((a, i) => <li key={i} className="text-gray-700">{a}</li>)}</ol></div>)}
              {aiAnalysis.analysis_summary && <p className="mt-2 text-xs text-gray-600 leading-relaxed italic border-t border-purple-200 pt-2">{aiAnalysis.analysis_summary}</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── 匹配分析 ── */}
      {jdResult && aiAnalysis && (
        <div className="card bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
          <div className="flex items-center justify-between"><div><h3 className="font-semibold text-gray-900">🔬 匹配分析</h3><p className="text-xs text-gray-500">将JD要求与候选人简历进行AI交叉比对</p></div><button className="btn-primary text-sm" onClick={handleMatch} disabled={matching}>{matching ? "⏳ 分析中..." : "🎯 开始匹配"}</button></div>
          {matchError && <p className="mt-2 text-sm text-red-500">{matchError}</p>}
          {(matchResults.length > 0 || decisions.length > 0) && (
            <div className="mt-4">
              {decStats && (<div className="grid grid-cols-7 gap-2 mb-4 text-center text-xs"><div className="bg-gray-50 rounded p-2"><b className="text-base">{decStats.total}</b><br/>总计</div><div className="bg-purple-50 rounded p-2"><b className="text-base text-purple-600">{decStats.s_count}</b><br/>S</div><div className="bg-green-50 rounded p-2"><b className="text-base text-green-600">{decStats.a_count}</b><br/>A</div><div className="bg-yellow-50 rounded p-2"><b className="text-base text-yellow-600">{decStats.b_count}</b><br/>B</div><div className="bg-red-50 rounded p-2"><b className="text-base text-red-500">{decStats.c_count}</b><br/>C</div><div className="bg-blue-50 rounded p-2"><b className="text-base text-blue-600">{decStats.interview_count}</b><br/>面试</div><div className="bg-orange-50 rounded p-2"><b className="text-base text-orange-500">{decStats.backup_count}</b><br/>备选</div></div>)}
              <div className="space-y-3">{(decisions.length > 0 ? decisions : matchResults).map((d: any, i: number) => {
                const mr = d.candidate_id ? matchResults.find(m => m.candidate_id === d.candidate_id) : d;
                return (<div key={d.candidate_id || i} className="border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between"><div className="flex items-center gap-3"><span className="text-sm text-gray-400 w-5">{d.rank || i + 1}</span><span className={`px-2 py-1 rounded text-sm font-bold ${ratingColor(d.rating || mr?.rating)}`}>{d.rating || mr?.rating || "?"}级</span><div><p className="font-semibold">{d.candidate_name || aiAnalysis?.basic_info.name || "?"}</p><p className="text-sm text-gray-500">{d.current_title || aiAnalysis?.job_preference.desired_title}</p></div></div><div className="text-right"><p className="text-xl font-bold">{formatScore(d.overall_score ?? mr?.overall_score)}</p><span className={`text-xs px-2 py-0.5 rounded ${(d.decision || mr?.decision) === "interview" ? "bg-green-100 text-green-700" : (d.decision || mr?.decision) === "backup" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>{decisionLabel(d.decision || mr?.decision)}</span></div></div>
                  <div className="grid grid-cols-3 gap-1 mt-1 text-xs text-gray-400"><span>硬性: {formatScore(d.hard_score ?? mr?.hard_score)}</span><span>软性: {formatScore(d.soft_score ?? mr?.soft_score)}</span><span>加分: {formatScore(d.bonus_score ?? mr?.bonus_score)}</span></div>
                  {(d.matched_points || mr?.matched_points)?.length > 0 && (<div className="mt-2 pt-2 border-t text-xs"><span className="text-green-600 font-medium">✅ 匹配点:</span>{(d.matched_points || mr?.matched_points || []).slice(0, 3).map((p: string, j: number) => (<p key={j} className="text-gray-600 mt-0.5">· {p}</p>))}</div>)}
                  {(d.gap_points || mr?.gap_points)?.length > 0 && (<div className="mt-1 text-xs"><span className="text-red-500 font-medium">⚠️ 差距点:</span>{(d.gap_points || mr?.gap_points || []).slice(0, 2).map((p: string, j: number) => (<p key={j} className="text-gray-600 mt-0.5">· {p}</p>))}</div>)}
                  {(d.interview_questions || mr?.interview_questions)?.length > 0 && (<div className="mt-2 pt-2 border-t text-xs"><span className="text-primary-600 font-medium">🎯 面试关注点:</span>{(d.interview_questions || mr?.interview_questions || []).map((q: string, j: number) => (<p key={j} className="text-gray-600 mt-0.5">{j + 1}. {q}</p>))}</div>)}
                </div>);
              })}</div>
            </div>
          )}
        </div>
      )}

      {/* ═══ 候选人列表 ═══ */}
      <div className="card">
        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">📁 候选人列表{candidates.length > 0 && <span className="text-sm text-gray-400 font-normal ml-2">共 {candidates.length} 人</span>}</h3><button className="btn-primary text-sm" onClick={() => setModal(emptyModal())}>➕ 添加候选人</button></div>

        {/* 筛选栏 */}
        <div className="flex flex-wrap gap-2 mb-3 items-center text-sm">
          <select className="input-field w-auto text-xs" value={filterJob} onChange={e => { setFilterJob(e.target.value); setCurrentPage(1); }}>
            <option value="">全部岗位</option>
            {jobs.map((j: any) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <select className="input-field w-auto text-xs" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
            <option value={10}>10 人/页</option><option value={20}>20 人/页</option><option value={50}>50 人/页</option><option value={100}>100 人/页</option>
          </select>
          <div className="relative flex-1"><svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg><input className="input-field pl-9" placeholder="搜索姓名、职位、公司、技能..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} onKeyDown={e => e.key === "Enter" && e.preventDefault()} /></div>
          <button className="btn-primary text-sm px-4" onClick={() => {}}>🔍 搜索</button>
          {search && <button className="btn-secondary text-sm" onClick={() => { setSearch(""); setCurrentPage(1); }}>清空</button>}
        </div>

        <p className="text-xs text-gray-500 mb-3">
          共 {filtered.length} 人{search || filterJob ? `（已筛选 / 全部 ${candidates.length} 人）` : ""} · 第 {currentPage}/{totalPages} 页
        </p>

        {paged.length === 0 ? (<div className="text-center py-12 text-gray-400"><p className="text-3xl mb-2">👤</p><p className="text-sm">暂无候选人</p></div>) : (
          <div className="space-y-2">{paged.map(c => (
            <div key={c.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-bold shrink-0">{c.name.charAt(0)}</div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-gray-900">{c.name}</h4>
                      {c.sourcePlatform && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{c.sourcePlatform}</span>}
                      {c.jobId && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{(()=>{try{const j=JSON.parse(localStorage.getItem("recruit_jobs_list")||"[]");const job=j.find((x:any)=>x.id===c.jobId);return job?job.title:"岗位";}catch{return"岗位";}})()}</span>}
                      {c.matchRating && <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${c.matchRating==="S"?"bg-purple-100 text-purple-700":c.matchRating==="A"?"bg-green-100 text-green-700":c.matchRating==="B"?"bg-yellow-100 text-yellow-700":"bg-gray-100 text-gray-600"}`}>{c.matchRating}级</span>}
                      {c.matchScore != null && <span className="text-xs text-gray-500">{c.matchScore}分</span>}
                      {c.aiAnalysis && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">AI已分析</span>}
                    </div>
                    <p className="text-sm text-gray-700">{c.currentTitle}{c.currentCompany ? ` @ ${c.currentCompany}` : ""}</p>
                    <div className="flex gap-3 text-xs text-gray-500 mt-1 flex-wrap">{c.experienceYears != null && <span>{c.experienceYears}年</span>}{c.education && <span>{c.education}</span>}{c.school && <span>{c.school}</span>}<span>{formatDate(c.createdAt)}</span></div>
                    {c.skills.length > 0 && (<div className="flex flex-wrap gap-1 mt-1.5">{c.skills.slice(0, 6).map(s => <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{s}</span>)}{c.skills.length > 6 && <span className="text-xs text-gray-400">+{c.skills.length - 6}</span>}</div>)}
                    {c.notes && <p className="text-xs text-gray-400 mt-1 truncate max-w-md">📝 {c.notes}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  {c.aiAnalysis ? (
                    <button className="text-xs text-purple-600 hover:text-purple-700 font-medium px-2 py-1 rounded hover:bg-purple-50" onClick={() => router.push(`/candidates/${c.id}`)}>🤖 深度分析详情</button>
                  ) : (
                    <button className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50" onClick={() => router.push(`/candidates/${c.id}`)}>🔍 AI深度分析</button>
                  )}
                  <button className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="编辑" onClick={() => handleEdit(c)}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="删除" onClick={() => setDeletingId(c.id)}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}</div>
        )}

        {/* 翻页 */}
        <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t">
          <button className="btn-secondary text-xs px-3 py-1" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>← 上一页</button>
          <span className="text-sm text-gray-500">第 {currentPage} / {totalPages} 页 · 共 {filtered.length} 人</span>
          <button className="btn-secondary text-xs px-3 py-1" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>下一页 →</button>
        </div>
      </div>

      {/* ── 弹窗 ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] overflow-y-auto"><div className="absolute inset-0 bg-black/40" onClick={() => setModal(null)} /><div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4 z-10">
          <h3 className="text-lg font-semibold mb-4">{modal.mode === "add" ? "➕ 添加候选人" : "✏️ 编辑候选人"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm font-medium text-gray-700">姓名 <span className="text-red-500">*</span></span><input className="input-field mt-1" type="text" placeholder="必填" value={modal.name} onChange={e => setModal({ ...modal, name: e.target.value })} autoFocus /></label>
            <label className="block"><span className="text-sm font-medium text-gray-700">来源平台</span><select className="input-field mt-1" value={modal.sourcePlatform} onChange={e => setModal({ ...modal, sourcePlatform: e.target.value })}><option value="">—</option><option value="猎聘">猎聘</option><option value="BOSS直聘">BOSS直聘</option><option value="手动录入">手动录入</option></select></label>
            <label className="block"><span className="text-sm font-medium text-gray-700">当前职位</span><input className="input-field mt-1" type="text" placeholder="如：高级Java工程师" value={modal.currentTitle} onChange={e => setModal({ ...modal, currentTitle: e.target.value })} /></label>
            <label className="block"><span className="text-sm font-medium text-gray-700">当前公司</span><input className="input-field mt-1" type="text" placeholder="如：蚂蚁集团" value={modal.currentCompany} onChange={e => setModal({ ...modal, currentCompany: e.target.value })} /></label>
            <label className="block"><span className="text-sm font-medium text-gray-700">工作年限</span><input className="input-field mt-1" type="number" min="0" max="50" placeholder="如：8" value={modal.experienceYears} onChange={e => setModal({ ...modal, experienceYears: e.target.value })} /></label>
            <label className="block"><span className="text-sm font-medium text-gray-700">学历</span><select className="input-field mt-1" value={modal.education} onChange={e => setModal({ ...modal, education: e.target.value })}><option value="">—</option><option value="博士">博士</option><option value="硕士">硕士</option><option value="本科">本科</option><option value="大专">大专</option><option value="MBA">MBA</option></select></label>
            <label className="block col-span-2"><span className="text-sm font-medium text-gray-700">毕业学校</span><input className="input-field mt-1" type="text" value={modal.school} onChange={e => setModal({ ...modal, school: e.target.value })} /></label>
            <label className="block col-span-2"><span className="text-sm font-medium text-gray-700">技能标签 <span className="text-gray-400">（逗号分隔）</span></span><input className="input-field mt-1" type="text" placeholder="Java, Spring Cloud, MySQL, Redis..." value={modal.skillsText} onChange={e => setModal({ ...modal, skillsText: e.target.value })} /></label>
            <label className="block col-span-2"><span className="text-sm font-medium text-gray-700">行业标签 <span className="text-gray-400">（逗号分隔）</span></span><input className="input-field mt-1" type="text" placeholder="互联网, 金融科技..." value={modal.industryTagsText} onChange={e => setModal({ ...modal, industryTagsText: e.target.value })} /></label>
            <label className="block col-span-2"><span className="text-sm font-medium text-gray-700">备注</span><textarea className="input-field mt-1 h-16 resize-y" placeholder="面试评价、亮点、注意事项..." value={modal.notes} onChange={e => setModal({ ...modal, notes: e.target.value })} /></label>
          </div>
          <div className="flex justify-end gap-2 mt-5"><button className="btn-secondary text-sm" onClick={() => setModal(null)}>取消</button><button className="btn-primary text-sm" onClick={handleModalConfirm} disabled={!modal.name.trim()}>确认{modal.mode === "add" ? "添加" : "保存"}</button></div>
        </div></div>
      )}

      {/* ── 删除确认 ── */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/40" onClick={() => setDeletingId(null)} /><div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 z-10"><h3 className="text-lg font-semibold mb-2">⚠️ 确认删除</h3><p className="text-sm text-gray-600 mb-5">删除后无法恢复，确定要删除该候选人吗？</p><div className="flex justify-end gap-2"><button className="btn-secondary text-sm" onClick={() => setDeletingId(null)}>取消</button><button className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors" onClick={handleDelete}>确认删除</button></div></div></div>
      )}
    </div>
  );
}
