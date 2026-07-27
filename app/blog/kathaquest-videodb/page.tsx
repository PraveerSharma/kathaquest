import Image from "next/image";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "How KathaQuest Uses VideoDB to Turn Footage into Teaching Evidence",
  description:
    "An honest build story about using VideoDB retrieval, review, stitching, and timelines inside a multilingual AI lesson studio.",
};

export default function KathaQuestVideoDbBlog() {
  return (
    <main>
      <SiteHeader active="videodb-blog" />
      <article className="blog-article container">
        <header className="blog-hero">
          <p className="eyebrow">BUILD STORY | VIDEODB</p>
          <h1>A related video is not always a useful lesson.</h1>
          <p className="blog-deck">
            KathaQuest turns a school chapter into a narrated, interactive
            lesson. VideoDB finds the real-world evidence, keeps its source and
            timestamp attached, and gives the presentation engine something
            concrete to teach with.
          </p>
          <div className="blog-byline">
            <span>By Praveer Sharma</span>
            <span>10 minute read</span>
          </div>
        </header>

        <Image
          alt="KathaQuest home screen with a prepared chapter ready to use"
          className="blog-cover"
          height={1000}
          priority
          src="/blog/videodb-home.png"
          width={1440}
        />

        <section>
          <p>
            The first KathaQuest prototype was easy to explain. Give it a
            chapter, extract a few topics, search for matching footage, and
            place the clips on a page. It worked in a demo. Then I tried to
            learn from it.
          </p>
          <p>
            A dramatic lava shot can show what an eruption looks like. It
            cannot, by itself, explain why magma rises or how pressure builds
            below the surface. The result was related to the chapter, yet the
            child still had to make the important connection alone.
          </p>
          <p>
            That test changed the job I gave VideoDB. KathaQuest no longer asks
            it to decorate a topic. The lesson planner first decides what the
            child should understand. VideoDB then searches for a moment that
            can support one specific part of that explanation.
          </p>
        </section>

        <section>
          <h2>What happens after a chapter arrives</h2>
          <p>
            A learner can choose one of the prepared chapters or upload a
            text-based PDF. KathaQuest extracts the source, checks it for
            safety, and creates three learning objectives. Those objectives
            become the script and storyboard for a complete session.
          </p>
          <pre>
            <code>{`Chapter PDF
  -> source extraction and safety check
  -> lesson plan and three learning objectives
  -> educational script
  -> objective-specific VideoDB searches
  -> evidence review and timestamp selection
  -> nine-scene hybrid storyboard
  -> Remotion lesson with narration
  -> questions, quiz, and revision`}</code>
          </pre>
          <p>
            The storyboard mixes several kinds of teaching material. Real
            footage shows events that a camera can capture. Diagrams and
            deterministic animation handle mechanisms that are hard to see,
            such as sound waves, pressure, or the movement of magma below the
            crust. Maya the Explorer guides the child through captions,
            highlighted terms, and short checkpoints.
          </p>
          <p>
            This split matters. Asking a stock clip to explain an invisible
            process usually produces a pretty distraction. Asking footage to
            show the real world, while a diagram explains the mechanism, gives
            each medium a sensible job.
          </p>
        </section>

        <figure className="blog-wide-figure">
          <Image
            alt="Architecture diagram showing chapter planning, VideoDB search, evidence review, composition, and interactive learning"
            height={900}
            src="/blog/videodb-architecture.svg"
            unoptimized
            width={1600}
          />
          <figcaption>
            The chapter decides what to teach. VideoDB supplies reviewed
            evidence for the parts that benefit from real footage.
          </figcaption>
        </figure>

        <section>
          <h2>The archive is small on purpose</h2>
          <p>
            The current collection contains 12 reviewed educational videos from
            NASA, NOAA, the US Geological Survey, and the US National Park
            Service. The seeding process uploads each source URL to VideoDB and
            records its authority, licence, subject tags, age range, and safety
            review.
          </p>
          <p>
            A much larger collection would produce more keyword matches. It
            would also make two basic questions harder to answer: Can a child
            watch this, and can we trace where it came from? KathaQuest only
            accepts a runtime result when it maps back to the reviewed catalog.
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
            Spoken-word indexing finds definitions and cause-and-effect
            explanations in narration. Scene indexing covers evidence that may
            never be spoken aloud: droplets forming, lava emerging from a
            fissure, or a planet moving around the Sun. The scene prompt
            describes what is visible across several frames and avoids
            guessing beyond the image.
          </p>
        </section>

        <section>
          <h2>Search twice, then review again</h2>
          <p>
            Broad searches such as &quot;water cycle&quot; often return
            introductions or attractive establishing shots. KathaQuest writes
            up to three focused queries for each learning objective and sends
            every query to the spoken-word and visual-scene indexes.
          </p>
          <p>
            The results enter a shared candidate pool. The pipeline removes
            overlapping moments, rejects anything outside the approved source
            list, and adds only a small topic boost. A structured reviewer then
            reads the learning objective beside each transcript or scene
            description.
          </p>
          <p>
            Lesson footage needs at least 0.62 review confidence and 0.57
            combined confidence. A child&apos;s follow-up question uses stricter
            gates: 0.68 review confidence and 0.61 combined confidence. A weak
            semantic score cannot be rescued by a nice title.
          </p>
          <pre>
            <code>{`learning objective
  -> up to 3 focused queries
  -> spoken index + scene index
  -> reviewed-source allowlist
  -> overlap removal
  -> structured precision review
  -> timestamp context expansion
  -> VideoDB HLS compilation`}</code>
          </pre>
          <p>
            Accepted moments are expanded so the child sees enough context.
            VideoDB then compiles as many as four complementary ranges into one
            HLS evidence chapter. A full lesson episode needs at least 50
            seconds of approved material. Five seconds of an eruption may be
            memorable, but it is not enough to teach the concept.
          </p>
          <figure>
            <Image
              alt="A KathaQuest Water Cycle adventure with reviewed VideoDB evidence and timestamps"
              height={1000}
              src="/blog/videodb-adventure.png"
              width={1440}
            />
            <figcaption>
              Every accepted clip keeps its source, licence, timestamp,
              retrieval type, and review reason.
            </figcaption>
          </figure>
        </section>

        <section>
          <h2>Sometimes the correct video is no video</h2>
          <p>
            I tested the pipeline with <em>How Sound Travels</em>. The current
            archive covers volcanoes, water, space, plants, and butterflies. It
            does not contain a reviewed source that properly explains
            vibration, pitch, and the ear.
          </p>
          <p>
            Lowering the relevance threshold would have filled the page. It
            also would have told the child that a loosely related clip was
            evidence. KathaQuest instead rewrites the search once. If nothing
            strong survives, it keeps the chapter-grounded explanation and
            routes that scene to SVG diagrams and Remotion animation.
          </p>
          <p>
            The interface states what happened. There is no dead player and no
            unrelated replacement. The page may look less full in that case,
            but the lesson is more honest.
          </p>
        </section>

        <section>
          <h2>VideoDB stays useful after retrieval</h2>
          <p>
            The approved ranges remain programmable media. VideoDB compiles
            them into a browser-playable evidence stream. For localized
            evidence reels, KathaQuest creates a new narration track, uploads
            the audio to VideoDB, lowers the original audio, and combines both
            tracks with Editor Timeline.
          </p>
          <p>
            The complete session uses Remotion to place those timestamped
            ranges beside diagrams, captions, transitions, and Maya. Children
            can play the whole film or jump to a single scene. The evidence
            chapters remain available as deeper source material rather than
            disappearing inside the composition.
          </p>
          <p>
            The learning-language control applies to the entire experience.
            English and ten Indian regional languages are supported. Changing
            it localizes the lesson text, questions, quiz, captions, and
            narration while preserving the verified source facts.
          </p>
          <figure>
            <Image
              alt="KathaQuest Lesson Studio combining VideoDB footage with diagrams, captions, and navigation"
              height={1000}
              src="/blog/videodb-lesson-studio.png"
              width={1440}
            />
            <figcaption>
              The Lesson Studio presents one teaching sequence instead of a
              playlist of loosely connected clips.
            </figcaption>
          </figure>
        </section>

        <section>
          <h2>A follow-up question now becomes a small lesson</h2>
          <p>
            The &quot;Still curious?&quot; section began as a text box. It now
            uses the same media pipeline on a smaller scale. The child types or
            speaks a question and gets a short answer grounded in the full
            chapter. KathaQuest then checks VideoDB for direct evidence and
            builds a 40 to 70 second Curiosity Clip.
          </p>
          <p>
            Each clip has four scenes: Maya introduces the question, a diagram
            models the mechanism, an evidence scene uses approved footage or an
            animation, and a checkpoint asks the child to recall or predict.
            Two narration acts keep the voice synchronized with the scene
            timing. Prepared clips are cached in the browser, so returning to
            the lesson does not start the work again.
          </p>
          <p>
            During the production check for the magma question, the archive did
            not return strong enough footage. The system used animation and
            answered from the original chapter: magma often rises because it is
            less dense than the surrounding rock, while heat and trapped gases
            help push it through cracks. The resulting clip ran for 65 seconds
            and passed the internal grounding check at 100.
          </p>
          <p>
            That result is a better demonstration of the product than forcing
            a volcano clip into the answer. VideoDB searched, the precision gate
            said no, and the lesson still explained the science.
          </p>
        </section>

        <section>
          <h2>The quiz can send the learner back to the evidence</h2>
          <p>
            After the session, the quiz is checked against answers stored only
            inside the encrypted lesson token. If the learner misses a concept,
            KathaQuest can run a shorter VideoDB search and compile a revision
            reel for that idea. The same source rules and relevance review still
            apply.
          </p>
          <p>
            OpenTelemetry traces record the search, review, compilation,
            localization, Curiosity Clip, narration, and revision steps.
            SigNoz then shows where a slow or empty VideoDB search affected the
            lesson. This has been useful because an empty result and a provider
            failure need different fixes.
          </p>
        </section>

        <section>
          <h2>What VideoDB contributes today</h2>
          <div className="blog-fact-grid">
            <article>
              <span>Ingest</span>
              <strong>12 reviewed educational sources</strong>
              <p>Each asset keeps its authority, licence, and safety record.</p>
            </article>
            <article>
              <span>Understand</span>
              <strong>Spoken and visual indexes</strong>
              <p>Explanations and visible events are searched together.</p>
            </article>
            <article>
              <span>Compose</span>
              <strong>Timestamped HLS evidence reels</strong>
              <p>Approved ranges become playable chapters and revisions.</p>
            </article>
            <article>
              <span>Localize</span>
              <strong>Narration on the same footage</strong>
              <p>Editor Timeline keeps the evidence while the language changes.</p>
            </article>
          </div>
          <p>
            The archive is still the limiting factor. It needs curriculum
            metadata, more subjects, and teacher-approved reference moments.
            Those are practical next steps, not reasons to relax the current
            quality gate.
          </p>
          <p>
            KathaQuest started as PDF to video. The current product is closer to
            an AI lesson studio: the chapter supplies the facts, VideoDB finds
            trustworthy real-world moments, and the presentation engine
            explains the parts that footage cannot show.
          </p>
          <div className="blog-cta">
            <div>
              <h2>Try the current workflow</h2>
              <p>Choose a prepared chapter or upload your own school PDF.</p>
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
