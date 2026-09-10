import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllCategories,
    getAllGames,
    getAllGameIds,
    getGameById,
    getAllPublishers,
    getFilteredGames,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    it('returns categories and publishers ordered by name', async () => {
        await db.insert(categories).values([
            { name: 'Zany', description: 'cat' },
            { name: 'Adventure', description: 'cat' },
        ]);
        await db.insert(publishers).values([
            { name: 'Zed Games', description: 'pub' },
            { name: 'Alpha Games', description: 'pub' },
        ]);

        expect((await getAllCategories(db)).map((category) => category.name)).toEqual([
            'Adventure',
            'Zany',
        ]);
        expect((await getAllPublishers(db)).map((publisher) => publisher.name)).toEqual([
            'Alpha Games',
            'Zed Games',
        ]);
    });

    it('filters games by categories and publisher together', async () => {
        const [strategy] = await db
            .insert(categories)
            .values([
                { name: 'Strategy', description: 'cat' },
                { name: 'Adventure', description: 'cat' },
            ])
            .returning({ id: categories.id });
        const adventure = await db
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.name, 'Adventure'))
            .get();
        const [publisher] = await db
            .insert(publishers)
            .values([
                { name: 'Pub One', description: 'pub' },
                { name: 'Pub Two', description: 'pub' },
            ])
            .returning({ id: publishers.id });
        const pubTwo = await db
            .select({ id: publishers.id })
            .from(publishers)
            .where(eq(publishers.name, 'Pub Two'))
            .get();

        await db.insert(games).values([
            { title: 'Strategy One', description: 'game', starRating: 4, categoryId: strategy.id, publisherId: publisher.id },
            { title: 'Adventure Two', description: 'game', starRating: 4, categoryId: adventure?.id ?? 0, publisherId: pubTwo?.id ?? 0 },
            { title: 'Strategy Two', description: 'game', starRating: 4, categoryId: strategy.id, publisherId: pubTwo?.id ?? 0 },
        ]);

        const filtered = await getFilteredGames(db, [strategy.id], pubTwo?.id);
        expect(filtered.map((game) => game.title)).toEqual(['Strategy Two']);
    });

    it('returns all matching categories when no publisher is selected', async () => {
        await seedGames(db, 1);
        const [otherCategory] = await db
            .insert(categories)
            .values({ name: 'Adventure', description: 'cat' })
            .returning({ id: categories.id });
        await db.insert(games).values({
            title: 'Adventure Game',
            description: 'game',
            starRating: 4,
            categoryId: otherCategory.id,
            publisherId: 1,
        });

        const filtered = await getFilteredGames(db, [1, otherCategory.id]);
        expect(filtered.map((game) => game.title)).toEqual(['Adventure Game', 'Game 01']);
    });
});
