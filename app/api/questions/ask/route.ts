import { NextResponse } from "next/server";

import { answerQuestion } from "@/lib/llm";
import { getLesson } from "@/lib/storage";
import { transcribeWithSarvam } from "@/lib/sarvam";
import { telemetry } from "@/lib/telemetry";
import { searchEducationalArchive } from "@/lib/videodb";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    let lessonId = "";
    let question = "";
    let transcript: string | undefined;

    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      lessonId = String(form.get("lessonId") ?? "");
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
        question?: string;
      };
      lessonId = body.lessonId ?? "";
      question = body.question ?? "";
    }

    if (!lessonId || question.trim().length < 2) {
      return NextResponse.json(
        { error: "Lesson ID and question are required" },
        { status: 400 },
      );
    }

    const lesson = await getLesson(lessonId);
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    telemetry.questionsAsked.add(1, { language: lesson.language });
    const answer = await answerQuestion({
      question,
      lessonTitle: lesson.title,
      concepts: lesson.concepts,
      language: lesson.language,
    });
    const support = await searchEducationalArchive(answer.videoSearchQuery);
    if (!support) {
      return NextResponse.json(
        { error: "No supporting VideoDB evidence was found" },
        { status: 422 },
      );
    }

    return NextResponse.json({
      transcript,
      answer: answer.answer,
      streamUrl: support.streamUrl,
      evidence: support.evidence,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Question answering failed",
      },
      { status: 500 },
    );
  }
}
