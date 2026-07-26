import { NextResponse } from "next/server";

import {
  answerQuestion,
  createQuestionSearchQuery,
} from "@/lib/llm";
import { openLesson } from "@/lib/lesson-session";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertKidSafeText } from "@/lib/safety";
import { transcribeWithSarvam } from "@/lib/sarvam";
import { telemetry } from "@/lib/telemetry";
import { searchEducationalArchive } from "@/lib/videodb";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, "question", 20, 10 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Question limit reached. Please try again shortly." },
      {
        status: 429,
        headers: { "retry-after": String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  try {
    let lessonId = "";
    let lessonToken = "";
    let question = "";
    let transcript: string | undefined;

    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      lessonId = String(form.get("lessonId") ?? "");
      lessonToken = String(form.get("lessonToken") ?? "");
      question = String(form.get("question") ?? "");
      const audio = form.get("audio");
      if (audio instanceof File && audio.size > 0) {
        const result = await transcribeWithSarvam(audio);
        transcript = result.transcript;
        question = result.transcript;
      }
    } else {
      const body = (await request.json()) as {
        lessonId?: string;
        lessonToken?: string;
        question?: string;
      };
      lessonId = body.lessonId ?? "";
      lessonToken = body.lessonToken ?? "";
      question = body.question ?? "";
    }

    if (
      !lessonId ||
      !lessonToken ||
      lessonToken.length > 200_000 ||
      question.trim().length < 2 ||
      question.length > 1_000
    ) {
      return NextResponse.json(
        { error: "Lesson ID and question are required" },
        { status: 400 },
      );
    }

    const lesson = openLesson(lessonToken);
    if (lesson.id !== lessonId) {
      return NextResponse.json({ error: "Lesson session mismatch" }, { status: 401 });
    }

    await assertKidSafeText(question, "question");
    telemetry.questionsAsked.add(1, { language: lesson.language });
    const searchQuery = await createQuestionSearchQuery({
      question,
      lessonTitle: lesson.title,
      concepts: lesson.concepts,
    });
    const support = await searchEducationalArchive(searchQuery);
    if (!support) {
      return NextResponse.json(
        { error: "No supporting VideoDB evidence was found" },
        { status: 422 },
      );
    }
    const answer = await answerQuestion({
      question,
      lessonTitle: lesson.title,
      concepts: lesson.concepts,
      evidence: support.evidence,
      language: lesson.language,
    });
    await assertKidSafeText(answer, "answer");

    return NextResponse.json({
      transcript,
      answer,
      streamUrl: support.streamUrl,
      evidence: support.evidence,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Question answering failed";
    return NextResponse.json(
      { error: message },
      { status: message.includes("session") ? 401 : 500 },
    );
  }
}
