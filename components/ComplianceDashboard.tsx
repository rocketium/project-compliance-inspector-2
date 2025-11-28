
import React from "react";
import { ComplianceScores } from "../types";
import {
  ShieldCheck,
  Eye,
  Accessibility,
  FileCheck,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

interface ComplianceDashboardProps {
  scores: ComplianceScores;
  className?: string;
}

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  size = 80,
  strokeWidth = 6,
  label,
  icon,
  color,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-amber-500";
    return "text-red-500";
  };

  const getTrackColor = (score: number) => {
    if (score >= 80) return "stroke-green-500";
    if (score >= 60) return "stroke-amber-500";
    return "stroke-red-500";
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-200 dark:text-slate-700"
          />
          {/* Progress track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={`${getTrackColor(score)} transition-all duration-1000 ease-out`}
          />
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-lg font-bold ${getScoreColor(score)}`}>
            {score}%
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className={color}>{icon}</span>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
          {label}
        </span>
      </div>
    </div>
  );
};

const OverallScoreDisplay: React.FC<{ score: number; breakdown: ComplianceScores["breakdown"] }> = ({
  score,
  breakdown,
}) => {
  const getGrade = (score: number): { letter: string; label: string; color: string } => {
    if (score >= 90) return { letter: "A", label: "Excellent", color: "text-green-500" };
    if (score >= 80) return { letter: "B", label: "Good", color: "text-green-400" };
    if (score >= 70) return { letter: "C", label: "Fair", color: "text-amber-500" };
    if (score >= 60) return { letter: "D", label: "Needs Work", color: "text-orange-500" };
    return { letter: "F", label: "Critical Issues", color: "text-red-500" };
  };

  const grade = getGrade(score);
  const passRate = breakdown.total > 0 
    ? Math.round((breakdown.passed / breakdown.total) * 100) 
    : 0;

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Overall Compliance Score
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {breakdown.passed}/{breakdown.total} rules passed
          </p>
        </div>
        <div className="flex items-center gap-1">
          {score >= 70 ? (
            <TrendingUp size={16} className="text-green-500" />
          ) : score >= 50 ? (
            <Minus size={16} className="text-amber-500" />
          ) : (
            <TrendingDown size={16} className="text-red-500" />
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Large Score Circle */}
        <div className="relative w-24 h-24">
          <svg className="transform -rotate-90" width={96} height={96}>
            <circle
              cx={48}
              cy={48}
              r={42}
              fill="none"
              stroke="currentColor"
              strokeWidth={8}
              className="text-slate-200 dark:text-slate-700"
            />
            <circle
              cx={48}
              cy={48}
              r={42}
              fill="none"
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={264}
              strokeDashoffset={264 - (score / 100) * 264}
              className={`${
                score >= 80
                  ? "stroke-green-500"
                  : score >= 60
                  ? "stroke-amber-500"
                  : "stroke-red-500"
              } transition-all duration-1000 ease-out`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${grade.color}`}>{score}</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              / 100
            </span>
          </div>
        </div>

        {/* Grade and Stats */}
        <div className="flex-1">
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-3xl font-black ${grade.color}`}>
              {grade.letter}
            </span>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {grade.label}
            </span>
          </div>
          
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Pass Rate</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {passRate}%
              </span>
            </div>
            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  passRate >= 80
                    ? "bg-green-500"
                    : passRate >= 60
                    ? "bg-amber-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${passRate}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-slate-600 dark:text-slate-400">
            {breakdown.passed} Passed
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-slate-600 dark:text-slate-400">
            {breakdown.warnings} Warnings
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-slate-600 dark:text-slate-400">
            {breakdown.failed} Failed
          </span>
        </div>
      </div>
    </div>
  );
};

export const ComplianceDashboard: React.FC<ComplianceDashboardProps> = ({
  scores,
  className = "",
}) => {
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Overall Score */}
      <OverallScoreDisplay score={scores.overall} breakdown={scores.breakdown} />

      {/* Dimension Scores */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
          Score Breakdown by Category
        </h4>
        <div className="grid grid-cols-4 gap-2">
          <ScoreRing
            score={scores.brand}
            size={70}
            strokeWidth={5}
            label="Brand"
            icon={<Eye size={12} />}
            color="text-purple-500"
          />
          <ScoreRing
            score={scores.accessibility}
            size={70}
            strokeWidth={5}
            label="A11y"
            icon={<Accessibility size={12} />}
            color="text-blue-500"
          />
          <ScoreRing
            score={scores.policy}
            size={70}
            strokeWidth={5}
            label="Policy"
            icon={<FileCheck size={12} />}
            color="text-emerald-500"
          />
          <ScoreRing
            score={scores.quality}
            size={70}
            strokeWidth={5}
            label="Quality"
            icon={<Sparkles size={12} />}
            color="text-amber-500"
          />
        </div>
      </div>

      {/* Legend */}
      <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
        Scores weighted by rule severity (critical × 3, major × 2, minor × 1)
      </div>
    </div>
  );
};

