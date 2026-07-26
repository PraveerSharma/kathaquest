# VideoDB research and implementation

Last reviewed: 2026-07-26

## Goal

KathaQuest must return useful educational video, not merely a semantically similar few seconds. A result is accepted only when a reviewed, all-ages source directly helps teach the chapter’s learning objective.

## Capabilities evaluated

### Indexing and retrieval

VideoDB supports spoken-word, scene and custom audio indexes. Its accuracy guidance recommends specific scene prompts, multiple frames per interval, appropriate semantic/keyword search, score thresholds, multiple indexes and application-level LLM post-filtering.

- [Create an index](https://docs.videodb.io/pages/understand/indexing-pipelines/create-an-index)
- [Natural-language search](https://docs.videodb.io/pages/understand/search-and-retrieval/natural-language-query)
- [Search accuracy tips](https://docs.videodb.io/pages/understand/quality-and-evaluation/accuracy-tips)
- [Collection search and metadata filters](https://docs.videodb.io/pages/understand/search-and-retrieval/collection-search)

KathaQuest consequently:

1. searches spoken and visual indexes with up to three objective-specific queries;
2. pools candidates instead of trusting the first result;
3. removes overlapping moments and rejects media outside its reviewed allowlist;
4. asks a structured LLM reviewer whether each moment directly teaches the objective;
5. retains only candidates with at least 0.55 review confidence;
6. expands accepted moments to include teaching context; and
7. stitches as many as four complementary moments into a lesson of at least 50 seconds.

The UI exposes source, timestamp, retrieval type, review confidence and the reviewer’s selection reason.

### Programmable editing and stitching

VideoDB search results can be compiled directly into one HLS stream. Its Editor Timeline also models ordered video assets and layered audio assets, enabling KathaQuest to preserve the selected video sequence while adding translated narration.

- [Timeline architecture](https://docs.videodb.io/pages/act/programmable-editing/timeline-architecture)
- [Timeline API](https://docs.videodb.io/api-reference/timeline)
- [Audio overlay](https://docs.videodb.io/examples-and-tutorials/programmatic-editing/audio-overlay)
- [Voiceovers with Editor Timeline](https://docs.videodb.io/examples-and-tutorials/content-factory/voiceovers)

The production flow generates Sarvam audio, uploads it as a VideoDB audio asset, places original evidence clips sequentially at low source-audio volume, overlays narration from time zero, and generates a new synchronized HLS stream. A browser-synchronized audio fallback keeps the lesson usable if composition fails.

### Dubbing

The SDK exposes `Collection.dubVideo` for a single stored video asset. KathaQuest lessons, however, are compiled from several timestamp ranges across one or more assets. Applying dubbing before retrieval would duplicate work and applying it to a search-result manifest is not supported by the current SDK shape. Editor Timeline composition is therefore the reliable multilingual path for stitched lessons.

### Video RAG

VideoDB’s video-RAG patterns support grounding answers in retrieved moments. KathaQuest applies the same precision gate to child questions. If the chapter supports a text answer but the archive lacks a direct visual explanation, it answers from verified chapter facts and explicitly says that no strong matching video was found. It never attaches a merely adjacent clip.

- [Video RAG overview](https://docs.videodb.io/examples-and-tutorials/video-rag/index)

## Child-safety and usefulness rules

- Media must appear in the reviewed catalog and be marked all-ages.
- Generated language is moderated and grounded in verified chapter text plus accepted evidence.
- Explanations target 120–180 spoken words with a hook, step-by-step cause and effect, one supported analogy and a recap.
- Lesson reels must be at least 50 seconds; Q&A and revision reels have separate shorter minimums.
- An unsupported concept produces a clear failure instead of irrelevant footage.
- Voices are warm educational adult voices at a slightly slower pace; KathaQuest does not imitate children.

## Current provider limitation

On 2026-07-26, `videodb` SDK 0.2.7 successfully uploaded, spoken-indexed, scene-indexed, searched and compiled all 12 catalog videos. Calls to the optional enhanced `indexAudio` endpoint returned VideoDB HTTP 500 for both new and existing assets. The resumable seed process records this as `audio_upgrade_skipped` and retains the working spoken and scene indexes. This does not affect the current lesson, search, stitching or narration-composition paths.

## Recommended next improvements

1. Expand the reviewed archive per curriculum unit and store grade, board, subject and topic metadata for filtered collection search.
2. Have teachers approve canonical moments and compare automatic retrieval against that gold set.
3. Pre-compose the most popular lesson/language combinations to remove on-demand latency.
4. Add transcript/scene coverage dashboards and alerts for low-confidence objectives.
5. Re-test enhanced audio indexing after a VideoDB SDK or service update.
