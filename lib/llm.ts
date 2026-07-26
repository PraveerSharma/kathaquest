import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { env, requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withSpan } from "@/lib/telemetry";
import type { LearningConcept, LessonLanguage } from "@/lib/types";

const conceptSchema = z.object({
  title: z.string().min(4).max(90),
  explanation: z.string().min(30).max(500),
  videoSearchQuery: z.string().min(4).max(180),
  quiz: z.object({
    question: z.string().min(8).max(180),
    options: z.array(z.string().min(1).max(100)).length(4),
    correctAnswer: z.string().min(1).max(100),
  }),
});

const chapterSchema = z.object({
  chapterTitle: z.string().min(2).max(100),
  concepts: z.array(conceptSchema).length(3),
});

const queryRewriteSchema = z.object({
  query: z.string().min(4).max(180),
});

const answerSchema = z.object({
  answer: z.string().min(5).max(600),
  videoSearchQuery: z.string().min(4).max(180),
});

let client: OpenAI | undefined;

function openai(): OpenAI {
  client ??= new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  return client;
}

function normalizeConcepts(
  concepts: z.infer<typeof conceptSchema>[],
): LearningConcept[] {
  return concepts.map((concept, index) => {
    if (!concept.quiz.options.includes(concept.quiz.correctAnswer)) {
      throw new Error(`Quiz ${index + 1} does not contain its correct answer`);
    }
    return {
      ...concept,
      id: `concept-${index + 1}`,
    };
  });
}

export async function extractConcepts({
  chapterText,
  ageGroup,
  language,
}: {
  chapterText: string;
  ageGroup: string;
  language: LessonLanguage;
}): Promise<{ chapterTitle: string; concepts: LearningConcept[] }> {
  return withSpan(
    "llm.extract_concepts",
    {
      "ai.provider": "openai",
      "ai.model": env.OPENAI_MODEL,
      "ai.input_size": chapterText.length,
      "student.age_group": ageGroup,
      "lesson.language": language,
    },
    async (span) => {
      const response = await openai().responses.parse({
        model: env.OPENAI_MODEL,
        reasoning: { effort: "none" },
        input: [
          {
            role: "system",
            content:
              "You turn one science chapter into exactly three evidence-seeking micro-lessons for a child. Stay faithful to the supplied text. Make every videoSearchQuery concrete and useful for searching real educational speech or scenes. Use English for videoSearchQuery even when explanations are Hindi. Return quiz options in the lesson language. Do not add citations or markdown.",
          },
          {
            role: "user",
            content: `Age group: ${ageGroup}\nLesson language: ${language === "hi-IN" ? "Hindi in Devanagari" : "English"}\n\nChapter:\n${chapterText.slice(0, 35_000)}`,
          },
        ],
        text: {
          format: zodTextFormat(chapterSchema, "chapter_learning_plan"),
        },
      });

      const parsed = response.output_parsed;
      if (!parsed) {
        throw new Error("OpenAI returned no structured chapter plan");
      }

      span.setAttributes({
        "ai.output_size": response.output_text.length,
        "chapter.title": parsed.chapterTitle,
      });
      logger.info(
        { event: "concepts.extracted", conceptCount: parsed.concepts.length },
        "Chapter concepts extracted",
      );

      return {
        chapterTitle: parsed.chapterTitle,
        concepts: normalizeConcepts(parsed.concepts),
      };
    },
  );
}

export async function rewriteSearchQuery(
  query: string,
  conceptTitle: string,
): Promise<string> {
  return withSpan(
    "videodb.rewrite_query",
    {
      "ai.provider": "openai",
      "ai.model": env.OPENAI_MODEL,
      "video.query": query,
    },
    async () => {
      const response = await openai().responses.parse({
        model: env.OPENAI_MODEL,
        reasoning: { effort: "none" },
        input: [
          {
            role: "system",
            content:
              "Rewrite a failed educational video search into one short, concrete English query that could match either narration or visible volcano footage.",
          },
          {
            role: "user",
            content: `Concept: ${conceptTitle}\nFailed query: ${query}`,
          },
        ],
        text: {
          format: zodTextFormat(queryRewriteSchema, "video_query_rewrite"),
        },
      });
      if (!response.output_parsed) {
        throw new Error("OpenAI returned no rewritten video query");
      }
      return response.output_parsed.query;
    },
  );
}

export async function answerQuestion({
  question,
  lessonTitle,
  concepts,
  language,
}: {
  question: string;
  lessonTitle: string;
  concepts: LearningConcept[];
  language: LessonLanguage;
}): Promise<{ answer: string; videoSearchQuery: string }> {
  return withSpan(
    "llm.answer_question",
    {
      "ai.provider": "openai",
      "ai.model": env.OPENAI_MODEL,
      "ai.input_size": question.length,
      "lesson.language": language,
    },
    async () => {
      const response = await openai().responses.parse({
        model: env.OPENAI_MODEL,
        reasoning: { effort: "none" },
        input: [
          {
            role: "system",
            content:
              "Answer a child's volcano question in at most three short sentences using only the supplied lesson concepts. Also produce one concrete English search query for supporting real video evidence. If the concepts do not support the answer, say that clearly. Write the answer in the requested language.",
          },
          {
            role: "user",
            content: `Lesson: ${lessonTitle}\nLanguage: ${language}\nConcepts: ${concepts.map((item) => `${item.title}: ${item.explanation}`).join("\n")}\nChild question: ${question}`,
          },
        ],
        text: {
          format: zodTextFormat(answerSchema, "child_question_answer"),
        },
      });
      if (!response.output_parsed) {
        throw new Error("OpenAI returned no structured answer");
      }
      return response.output_parsed;
    },
  );
}
