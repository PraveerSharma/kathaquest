import type { LessonLanguage } from "@/lib/types";

export const lessonLanguages: Array<{
  code: LessonLanguage;
  label: string;
  englishName: string;
  speaker: string;
}> = [
  { code: "en-IN", label: "English", englishName: "English (India)", speaker: "ishita" },
  { code: "hi-IN", label: "हिंदी", englishName: "Hindi", speaker: "priya" },
  { code: "bn-IN", label: "বাংলা", englishName: "Bengali", speaker: "suhani" },
  { code: "ta-IN", label: "தமிழ்", englishName: "Tamil", speaker: "ishita" },
  { code: "te-IN", label: "తెలుగు", englishName: "Telugu", speaker: "priya" },
  { code: "mr-IN", label: "मराठी", englishName: "Marathi", speaker: "priya" },
  { code: "gu-IN", label: "ગુજરાતી", englishName: "Gujarati", speaker: "priya" },
  { code: "kn-IN", label: "ಕನ್ನಡ", englishName: "Kannada", speaker: "ishita" },
  { code: "ml-IN", label: "മലയാളം", englishName: "Malayalam", speaker: "pooja" },
  { code: "pa-IN", label: "ਪੰਜਾਬੀ", englishName: "Punjabi", speaker: "roopa" },
  { code: "od-IN", label: "ଓଡ଼ିଆ", englishName: "Odia", speaker: "pooja" },
];

export const lessonLanguageCodes = lessonLanguages.map(
  (language) => language.code,
) as [LessonLanguage, ...LessonLanguage[]];

export function getLessonLanguage(language: LessonLanguage) {
  return (
    lessonLanguages.find((item) => item.code === language) ??
    lessonLanguages[0]
  );
}
