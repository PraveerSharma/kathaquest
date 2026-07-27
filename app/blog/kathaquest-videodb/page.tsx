import Image from "next/image";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "How KathaQuest Uses VideoDB to Turn Footage into Teaching Evidence",
  description:
    "A practical account of building a child-safe educational retrieval and video composition pipeline with VideoDB.",
};

export default function KathaQuestVideoDbBlog() {
  return (
    <main>
      <SiteHeader active="videodb-blog" />
      <article className="blog-article container">
        <header className="blog-hero">
          <p className="eyebrow">BUILD STORY | VIDEODB</p>
          <h1>
            I stopped asking VideoDB for a clip. I started asking it for
            evidence.
          </h1>
          <p className="blog-deck">
            KathaQuest turns a school chapter into one narrated lesson. VideoDB
            is the part that finds the real-world moments, preserves their
            sources, and refuses to bluff when the archive has nothing useful.
          </p>
          <div className="blog-byline">
            <span>By Praveer Sharma</span>
            <span>9 minute read</span>
          </div>
        </header>

        <Image
          alt="KathaQuest home screen with the Water Cycle chapter selected"
          className="blog-cover"
          height={1000}
          priority
          src="/blog/videodb-home.png"
          width={1440}
        />

        <section>
          <p>
            The first version of KathaQuest did something that looked good in a
            quick demo. It read a chapter, extracted a few topics, searched for
            related footage, and put the clips on a page.
          </p>
          <p>
            Then I watched it as if I were eight years old. A dramatic shot of
            lava is great at showing what an eruption looks like. It does not
            explain why magma rises, what pressure changes, or how a vent
            forms. The search result was related to the subject, but it was not
            teaching the idea.
          </p>
          <p>
            That distinction changed the product. KathaQuest now plans the
            lesson before it searches for media. It writes three learning
            objectives, a complete explanation, and a nine-scene storyboard.
            VideoDB receives a specific job for each objective: find a real
            moment that can support this exact part of the explanation.
          </p>
        </section>

        <section>
          <h2>The archive is small on purpose</h2>
          <p>
            The current collection contains 12 reviewed educational videos from
            NASA, NOAA, the US Geological Survey, and the US National Park
            Service. These are actual archived media files. The seeding script
            uploads each source URL to VideoDB and records its licence, source
            page, age range, subject tags, and safety review.
          </p>
          <p>
            I could have indexed a much larger pile of web video. That would
            have improved the chance of a keyword match while making it harder
            to answer two basic questions: Can a child watch this safely, and
            are we allowed to use it? Every runtime candidate must map back to
            the reviewed catalog before KathaQuest will show it.
          </p>
          <pre>
            <code>{`const uploaded = await collection.uploadURL({
  url: source.url,
  name: source.title,
  description: source.description,
  mediaType: "video",
});

await uploaded.indexSpokenWords("en", "sentence");
await uploaded.indexScenes({
  prompt: educationalScenePrompt,
  metadata: {
    archive: "kathaquest-kid-safe",
    source_id: source.id,
    kid_safe: "true",
  },
});`}</code>
          </pre>
          <p>
            Spoken-word indexing finds explanations, definitions, and
            cause-and-effect statements in narration. Scene indexing handles
            the evidence that nobody says aloud: water boiling in a pan,
            droplets forming, a lava fountain emerging from a fissure, or a
            planet moving around the Sun. The scene prompt asks VideoDB to
            describe what is visible across three frames and to avoid inferring
            facts that are not on screen.
          </p>
        </section>

        <figure className="blog-wide-figure">
          <Image
            alt="Architecture diagram showing how KathaQuest plans a lesson, searches VideoDB, reviews evidence, and composes the final experience"
            height={900}
            src="/blog/videodb-architecture.svg"
            unoptimized
            width={1600}
          />
          <figcaption>
            VideoDB is the evidence layer inside a wider lesson-planning and
            presentation pipeline.
          </figcaption>
        </figure>

        <section>
          <h2>One objective becomes several searches</h2>
          <p>
            A single broad query such as &quot;water cycle&quot; tends to return
            introductions and attractive establishing shots. KathaQuest asks
            OpenAI for up to three retrieval queries per learning objective,
            then runs each query against both spoken and scene indexes.
          </p>
          <p>
            The results are pooled and overlapping timestamps are removed.
            Topic tags add a small boost, but they cannot rescue a weak moment.
            A structured reviewer reads the objective beside the transcript or
            scene description and keeps only candidates with at least 0.55
            confidence. It also writes the reason shown to the learner.
          </p>
          <pre>
            <code>{`chapter objective
  -> 3 focused search queries
  -> spoken index + scene index
  -> reviewed-source allowlist
  -> overlap removal and topic boost
  -> LLM precision review
  -> timestamp context expansion
  -> VideoDB HLS compilation`}</code>
          </pre>
          <p>
            Useful moments are expanded to include enough context, then up to
            four complementary ranges are compiled into one HLS episode. A
            generated evidence chapter must contain at least 50 seconds of
            material. This rule is intentionally demanding. Five seconds of a
            volcano is a reaction clip, not a lesson.
          </p>
          <figure>
            <Image
              alt="A real KathaQuest Water Cycle adventure with reviewed VideoDB evidence and timestamps"
              height={1000}
              src="/blog/videodb-adventure.png"
              width={1440}
            />
            <figcaption>
              The UI keeps the VideoDB source, exact timestamp, licence, and
              review confidence next to the explanation.
            </figcaption>
          </figure>
        </section>

        <section>
          <h2>Retrieval is only half of the VideoDB work</h2>
          <p>
            The selected evidence ranges remain programmable media. VideoDB
            compiles them into a browser-playable stream for each deep-dive
            chapter. When a learner changes language, KathaQuest asks Sarvam for
            a new narration track, uploads that audio to VideoDB, lowers the
            source audio, and lays both tracks onto an Editor Timeline. The
            generated stream keeps the original sequence and receives the new
            voice.
          </p>
          <p>
            The same retrieval path is reused after the lesson. A typed or
            spoken question searches the archive for a direct answer. A missed
            quiz concept can request a shorter revision reel. VideoDB is not a
            one-time import step; it remains available while the child is
            learning.
          </p>
          <p>
            The complete film uses Remotion to combine those evidence ranges
            with diagrams, captions, highlighted terms, Maya the Explorer, and
            a pause-and-predict scene. Real footage is strongest when it shows
            the world. A diagram is stronger when the lesson needs to show an
            invisible mechanism.
          </p>
          <figure>
            <Image
              alt="KathaQuest lesson studio composing VideoDB footage with diagrams and captions"
              height={1000}
              src="/blog/videodb-lesson-studio.png"
              width={1440}
            />
            <figcaption>
              The Lesson Studio turns retrieved evidence into one continuous
              teaching sequence instead of a playlist.
            </figcaption>
          </figure>
        </section>

        <section>
          <h2>The Sound chapter found nothing, and that was useful</h2>
          <p>
            I tested the pipeline with a chapter called{" "}
            <em>How Sound Travels</em>. The collection has videos about
            volcanoes, water, space, plants, and butterflies. It does not yet
            contain a reviewed source that explains vibration, pitch, or the
            ear.
          </p>
          <p>
            The old pipeline failed the whole lesson. The tempting fix was to
            lower the relevance threshold until something appeared. I chose the
            opposite. KathaQuest now tries a rewritten search and replans around
            the archive up to three times. If no strong footage survives, the
            concept becomes a chapter-grounded visual explainer with diagrams,
            motion, captions, and narration. The interface says why.
          </p>
          <p>
            A production run of that PDF completed in 105 seconds and returned
            three visual explainers with zero substituted clips. This is not a
            failure of VideoDB. It is the boundary that makes the VideoDB
            results trustworthy. The product can stay useful without pretending
            that a loosely related video is evidence.
          </p>
        </section>

        <section>
          <h2>What VideoDB changed for KathaQuest</h2>
          <div className="blog-fact-grid">
            <article>
              <span>Ingest</span>
              <strong>12 real educational sources</strong>
              <p>Every asset retains its authority, licence, and safety record.</p>
            </article>
            <article>
              <span>Understand</span>
              <strong>Two complementary indexes</strong>
              <p>Spoken explanations and visual evidence are searched together.</p>
            </article>
            <article>
              <span>Act</span>
              <strong>Playable edited outputs</strong>
              <p>Selected timestamps become lesson, question, and revision reels.</p>
            </article>
            <article>
              <span>Localize</span>
              <strong>New audio on the same evidence</strong>
              <p>Editor Timeline keeps the footage while narration changes language.</p>
            </article>
          </div>
          <p>
            The next archive work is clear. I want curriculum metadata, teacher
            approved gold moments, and a coverage report that shows which
            learning objectives still need footage. The current collection is
            enough to prove the workflow. It is not yet broad enough to support
            every science chapter, and the product now says so plainly.
          </p>
          <p>
            KathaQuest began as PDF-to-video. It is becoming an AI lesson studio
            where the chapter decides what to teach, VideoDB supplies the
            real-world evidence, and the presentation engine explains what the
            camera cannot see.
          </p>
          <div className="blog-cta">
            <div>
              <h2>Try the evidence pipeline</h2>
              <p>
                Start with a prepared chapter or upload your own school PDF.
              </p>
            </div>
            <div className="blog-cta-actions">
              <a
                className="secondary-button"
                href="https://github.com/PraveerSharma/kathaquest"
                rel="noreferrer"
                target="_blank"
              >
                Read the source
              </a>
              <Link className="primary-button" href="/">
                Build a lesson
              </Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
