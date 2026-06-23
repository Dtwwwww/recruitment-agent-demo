import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 评级颜色映射 */
export function ratingColor(rating: string | null): string {
  switch (rating) {
    case "S":
      return "bg-purple-500 text-white";
    case "A":
      return "bg-green-500 text-white";
    case "B":
      return "bg-yellow-500 text-white";
    case "C":
      return "bg-red-400 text-white";
    default:
      return "bg-gray-300 text-gray-700";
  }
}

/** 决策文本映射 */
export function decisionLabel(decision: string | null): string {
  switch (decision) {
    case "interview":
      return "建议面试";
    case "backup":
      return "备选";
    case "reject":
      return "不推荐";
    default:
      return "未知";
  }
}

/** 任务状态文本 */
export function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "等待中";
    case "running":
      return "进行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    default:
      return status;
  }
}

/** 格式化分数 */
export function formatScore(score: number | null): string {
  if (score == null) return "-";
  return score.toFixed(1);
}
