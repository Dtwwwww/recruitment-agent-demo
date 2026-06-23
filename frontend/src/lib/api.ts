/**
 * API 客户端 — 封装所有与后端 FastAPI 的通信
 */

const API_BASE = "/api/v1";

interface RequestOptions {
  method?: string;
  body?: unknown;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body } = options;

  const headers: Record<string, string> = {};
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API Error: ${res.status}`);
  }

  return res.json();
}

// ── JD 解析 ──

export interface RequirementItem {
  category: string;
  description: string;
  priority: string;
  weight: number;
  is_must_have: boolean;
  match_type: string;
}

export interface JobRequirement {
  id: string;
  title: string;
  iceberg_above: {
    knowledge: RequirementItem[];
    skills: RequirementItem[];
    experience: RequirementItem[];
  };
  iceberg_below: {
    traits: RequirementItem[];
    competencies: RequirementItem[];
    motivations: RequirementItem[];
  };
  core_requirements: RequirementItem[];
  important_requirements: RequirementItem[];
  bonus_requirements: RequirementItem[];
}

export async function parseJD(rawJdText: string): Promise<JobRequirement> {
  return request<JobRequirement>("/jd/parse", {
    method: "POST",
    body: { raw_jd_text: rawJdText },
  });
}

export interface JobListItem {
  id: string;
  title: string;
  status: string | null;
  created_at: string | null;
  core_count: number;
  important_count: number;
  bonus_count: number;
}

export async function getJobs(): Promise<JobListItem[]> {
  return request<JobListItem[]>("/jd/jobs");
}

export async function getJob(jobId: string): Promise<JobRequirement> {
  return request<JobRequirement>(`/jd/jobs/${jobId}`);
}

// ── 搜索 ──

export interface SearchTaskResult {
  task_id: string;
  status: string;
  progress: { keywords?: string[]; location?: string; current_page?: number; total_candidates?: number; pages?: number; candidates?: number; method?: string; error?: string; talent_count?: number; scraping?: string } | null;
  result_count: number;
  error_message: string | null;
}

export async function executeSearch(params: {
  platform: string;
  keywords: string[];
  location: string;
  job_id?: string;
  max_pages?: number;
}): Promise<SearchTaskResult> {
  return request<SearchTaskResult>("/search/execute", {
    method: "POST",
    body: params,
  });
}

export async function getSearchStatus(taskId: string): Promise<SearchTaskResult> {
  return request<SearchTaskResult>(`/search/${taskId}/status`);
}

export interface Candidate {
  id: string;
  name: string | null;
  current_title: string | null;
  current_company: string | null;
  experience_years: number | null;
  education: string | null;
  school: string | null;
  skills: string[];
  industry_tags: string[];
  source_platform: string | null;
  source_url: string | null;
  created_at: string | null;
}

export async function getSearchResults(taskId: string): Promise<TalentListItem[]> {
  return request<TalentListItem[]>(`/search/${taskId}/results`);
}

// ── 匹配分析 ──

export interface MatchResult {
  id: string;
  candidate_id: string;
  job_id: string;
  overall_score: number | null;
  hard_score: number | null;
  soft_score: number | null;
  bonus_score: number | null;
  rating: string | null;
  matched_points: string[];
  gap_points: string[];
  interview_questions: string[];
  decision: string | null;
  analysis_summary: string | null;
}

export async function analyzeMatch(
  jobId: string,
  candidateIds: string[]
): Promise<MatchResult[]> {
  return request<MatchResult[]>("/match/analyze", {
    method: "POST",
    body: { job_id: jobId, candidate_ids: candidateIds },
  });
}

// ── 决策推荐 ──

export interface DecisionItem {
  rank: number;
  candidate_id: string;
  candidate_name: string | null;
  current_title: string | null;
  current_company: string | null;
  rating: string | null;
  overall_score: number;
  hard_score: number;
  soft_score: number;
  bonus_score: number;
  matched_points: string[];
  gap_points: string[];
  interview_questions: string[];
  decision: string | null;
  analysis_summary: string | null;
}

export interface DecisionStats {
  total: number;
  s_count: number;
  a_count: number;
  b_count: number;
  c_count: number;
  interview_count: number;
  backup_count: number;
  reject_count: number;
}

export interface DecisionResponse {
  decisions: DecisionItem[];
  stats: DecisionStats;
}

export async function getDecisionRecommendations(
  jobId: string,
  candidateIds: string[]
): Promise<DecisionResponse> {
  return request<DecisionResponse>("/decision/recommend", {
    method: "POST",
    body: { job_id: jobId, candidate_ids: candidateIds },
  });
}

// ── 候选人创建 ──

export async function createCandidate(data: {
  name: string;
  current_title: string;
  current_company: string;
  experience_years: number | null;
  education: string;
  school: string;
  skills: string[];
  industry_tags: string[];
  raw_text: string;
}): Promise<{ candidate_id: string }> {
  return request<{ candidate_id: string }>("/candidates", {
    method: "POST",
    body: data,
  });
}

// ── 简历分析 ──

export interface ResumeBasicInfo { name: string; email: string; phone: string; city: string; gender: string; age_range: string; }
export interface ResumeJobPreference { desired_title: string; desired_industry: string[]; expected_salary: string; location: string[]; }
export interface ResumeEducation { degree: string; school: string; major: string; graduation_year: string; is_elite_school: boolean; elite_note: string; }
export interface WorkExperienceItem { company: string; title: string; start_date: string; end_date: string; duration: string; responsibilities: string[]; achievements: string[]; }
export interface ResumeSkills { expert: string[]; proficient: string[]; familiar: string[]; categories: string[]; }
export interface ProjectItem { name: string; role: string; tech_stack: string[]; highlights: string[]; duration: string; }
export interface CareerTrajectory { total_years: number; company_count: number; avg_tenure_months: number; promotion_path: string[]; industry_span: string[]; stability_score: number; stability_assessment: string; }

export interface ResumeAnalysis {
  id: string;
  basic_info: ResumeBasicInfo;
  job_preference: ResumeJobPreference;
  education: ResumeEducation;
  work_experience: WorkExperienceItem[];
  skills: ResumeSkills;
  projects: ProjectItem[];
  career_trajectory: CareerTrajectory;
  strengths: string[];
  weaknesses: string[];
  overall_rating: string;
  development_advice: string[];
  analysis_summary: string;
}

export async function analyzeResume(rawResumeText: string): Promise<ResumeAnalysis> {
  return request<ResumeAnalysis>("/resume/analyze", {
    method: "POST",
    body: { raw_jd_text: rawResumeText },
  });
}

// ── 人才库 ──

export interface TalentListItem {
  id: string; name: string | null; current_title: string | null;
  current_company: string | null; experience_years: number | null;
  education: string | null; school: string | null; skills: string[];
  source_platform: string | null; source_url: string | null;
  quick_score: number | null;
  status: string; job_id: string | null; created_at: string | null;
}

export interface ScreenProgress {
  task_id: string; status: string; platform: string;
  total_screened: number; total_added: number;
  current_page: number; message: string;
}

export interface TalentDetail {
  id: string; name: string | null; current_title: string | null;
  current_company: string | null; experience_years: number | null;
  education: string | null; school: string | null;
  skills: string[]; industry_tags: string[];
  source_platform: string | null; source_url: string | null;
  resume_json: any; quick_score: number | null;
  match_json: any; interview_json: any;
  screenshot_url: string | null;
  status: string; job_id: string | null; created_at: string | null;
}

export interface MatchSummary {
  talent_id: string; name: string | null; current_title: string | null;
  current_company: string | null; rating: string | null;
  overall_score: number | null; hard_score: number | null;
  soft_score: number | null; bonus_score: number | null;
  matched_points: string[]; gap_points: string[];
  interview_questions: string[]; decision: string | null;
  analysis_summary: string | null;
}

export async function startScreen(params: {
  job_id: string; platform: string; keywords: string[]; location: string; max_pages?: number;
}): Promise<ScreenProgress> {
  return request<ScreenProgress>("/talent/screen", { method: "POST", body: params });
}

export async function getScreenStatus(taskId: string): Promise<ScreenProgress> {
  return request<ScreenProgress>(`/talent/screen/${taskId}/status`);
}

export async function getTalentList(jobId?: string): Promise<TalentListItem[]> {
  const q = jobId ? `?job_id=${jobId}` : "";
  return request<TalentListItem[]>(`/talent${q}`);
}

export async function getTalentDetail(talentId: string): Promise<TalentDetail> {
  return request<TalentDetail>(`/talent/${talentId}`);
}

export async function batchMatchTalent(jobId: string, talentIds: string[]): Promise<MatchSummary[]> {
  return request<MatchSummary[]>("/talent/match", { method: "POST", body: { job_id: jobId, talent_ids: talentIds } });
}

export async function confirmInterview(talentId: string, data: { job_id: string; candidate_data?: Record<string, any> }): Promise<TalentDetail> {
  return request<TalentDetail>(`/talent/${talentId}/interview`, { method: "POST", body: data });
}

export async function bindTalentToJob(talentIds: string[], jobId: string): Promise<{ bound: number }> {
  return request<{ bound: number }>(`/talent/bind?job_id=${jobId}`, { method: "POST", body: talentIds });
}

export async function deleteTalent(talentId: string): Promise<{ deleted: string }> {
  return request<{ deleted: string }>(`/talent/${talentId}`, { method: "DELETE" });
}

export async function updateTalent(talentId: string, data: Record<string, any>): Promise<{ updated: string }> {
  return request<{ updated: string }>(`/talent/${talentId}`, { method: "PUT", body: data });
}
