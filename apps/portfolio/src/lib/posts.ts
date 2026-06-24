import { getCollection, type CollectionEntry } from 'astro:content';

const WORDS_PER_MINUTE = 200;
const SAFE_TRANSITION_NAME_CHARACTER = /^[a-z0-9_-]$/;

interface PostTitleTransitionSegment {
  text: string;
  transitionName?: string;
}

const getSafeTransitionNamePart = (value: string): string =>
  Array.from(value.toLowerCase(), (character) => {
    if (SAFE_TRANSITION_NAME_CHARACTER.test(character)) {
      return character;
    }

    return `-${character.codePointAt(0)?.toString(36) ?? '0'}-`;
  }).join('');

export const getPostTitleTransitionName = (postId: string): string => {
  const safePostId = getSafeTransitionNamePart(postId);

  return `post-title-${safePostId || 'post'}`;
};

export const getPostTitleTransitionSegments = (
  postId: string,
  title: string,
): PostTitleTransitionSegment[] => {
  const baseName = getPostTitleTransitionName(postId);
  const wordCounts = new Map<string, number>();

  return (title.match(/\S+|\s+/g) ?? []).map((text) => {
    if (/^\s+$/.test(text)) {
      return { text };
    }

    const safeWord = getSafeTransitionNamePart(text) || 'word';
    const wordCount = wordCounts.get(safeWord) ?? 0;
    wordCounts.set(safeWord, wordCount + 1);

    return {
      text,
      transitionName: `${baseName}-${safeWord}${wordCount ? `-${wordCount + 1}` : ''}`,
    };
  });
};

export async function getPublishedPosts(): Promise<CollectionEntry<'writing'>[]> {
  const posts = await getCollection('writing', ({ data }) => !data.draft);

  return posts.sort(
    (left, right) => right.data.publishedAt.getTime() - left.data.publishedAt.getTime(),
  );
}

export function getReadingTime(body: string | undefined): number {
  const wordCount = body?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

export function formatPublishedDate(date: Date): string {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
