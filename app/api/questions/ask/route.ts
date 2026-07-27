import { NextResponse } from "next/server";

import { curiosityClipId } from "@/lib/curiosity-clip";
import { answerQuestion } from "@/lib/llm";
import {
  openLesson,
  sealCuriosityRequest,
} from "@/lib/lesson-session";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertKidSafeText } from "@/lib/safety";
import { transcribeWithSarvam } from "@/lib/sarvam";
import { telemetry, withSpan } from "@/lib/telemetry";
import type { CuriosityRequest } from "@/lib/types";

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
    return NextResponse.json(
      await withSpan(
        "curiosity.answer",
        {
          "lesson.id": lesson.id,
          "lesson.language": lesson.language,
          "curiosity.question_length": question.length,
        },
        async (span) => {
          telemetry.questionsAsked.add(1, { language: lesson.language });
          const answer = await answerQuestion({
            question,
            lessonTitle: lesson.title,
            concepts: lesson.concepts,
            evidence: [],
            language: lesson.language,
          });
          await assertKidSafeText(answer, "answer");
          const curiosityRequest: CuriosityRequest = {
            id: curiosityClipId({
              language: lesson.language,
              lessonId: lesson.id,
              question,
            }),
            question,
            answer,
            language: lesson.language,
            createdAt: new Date().toISOString(),
          };
          const questionToken = sealCuriosityRequest({
            request: curiosityRequest,
            lessonId: lesson.id,
          });
          span.setAttributes({
            "curiosity.request_id": curiosityRequest.id,
          });
          return {
            transcript,
            answer,
            questionId: curiosityRequest.id,
            questionToken,
          };
        },
      ),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Question answering failed";
    return NextResponse.json(
      { error: message },
      { status: message.includes("session") ? 401 : 500 },
    );
  }
}
