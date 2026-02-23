"use client";

export default function BrainWeather() {
  return (
    <div className="bg-navy-light rounded-2xl p-5 text-center">
      <p className="text-sm text-text-secondary mb-2">今日の脳のお天気</p>
      <p className="text-4xl mb-2">🌤️</p>
      <p className="text-lg font-bold text-text-primary">おおむね快晴</p>
      <p className="text-xs text-text-muted mt-1">
        脳波データ取得後にパーソナライズされます
      </p>
    </div>
  );
}
