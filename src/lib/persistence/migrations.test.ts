import { describe, expect, it, vi } from "vitest";
import {
	MIGRATIONS,
	runMigrations,
	WORKSPACE_DB_VERSION,
	type WorkspaceMigration,
} from "./migrations";

/**
 * `runMigrations` never touches the database directly — it only calls `upgrade`. These tests
 * drive it with synthetic migrations so the selection and error-propagation mechanism is proven
 * in isolation, independent of IndexedDB. `indexeddb.test.ts` proves the real fail-closed abort.
 */
function fakeDb(): IDBDatabase {
	return {} as IDBDatabase;
}
function fakeTransaction(): IDBTransaction {
	return {} as IDBTransaction;
}

function synthMigration(from: number, upgrade: WorkspaceMigration["upgrade"]): WorkspaceMigration {
	return { from, to: from + 1, upgrade };
}

describe("MIGRATIONS registry", () => {
	it("is contiguous and monotonic starting at version 0", () => {
		expect(MIGRATIONS.length).toBeGreaterThan(0);
		MIGRATIONS.forEach((migration, index) => {
			expect(migration.to).toBe(migration.from + 1);
			const expectedFrom = index === 0 ? 0 : MIGRATIONS[index - 1].to;
			expect(migration.from).toBe(expectedFrom);
		});
	});

	it("covers exactly up to the current database version", () => {
		const highest = MIGRATIONS[MIGRATIONS.length - 1].to;
		expect(highest).toBe(WORKSPACE_DB_VERSION);
	});
});

describe("runMigrations", () => {
	it("invokes exactly the migrations in (oldVersion, newVersion] in ascending order", () => {
		const calls: number[] = [];
		const migrations = [
			synthMigration(0, () => calls.push(1)),
			synthMigration(1, () => calls.push(2)),
			synthMigration(2, () => calls.push(3)),
			synthMigration(3, () => calls.push(4)),
		];

		runMigrations(fakeDb(), fakeTransaction(), 1, 3, migrations);

		// oldVersion 1 -> newVersion 3 crosses the 1->2 and 2->3 steps only.
		expect(calls).toEqual([2, 3]);
	});

	it("runs the initial creation step for a fresh (version 0) database", () => {
		const calls: number[] = [];
		const migrations = [
			synthMigration(0, () => calls.push(1)),
			synthMigration(1, () => calls.push(2)),
		];

		runMigrations(fakeDb(), fakeTransaction(), 0, 1, migrations);

		expect(calls).toEqual([1]);
	});

	it("applies no migration when the version is unchanged", () => {
		const upgrade = vi.fn();
		runMigrations(fakeDb(), fakeTransaction(), 2, 2, [
			synthMigration(0, upgrade),
			synthMigration(1, upgrade),
		]);
		expect(upgrade).not.toHaveBeenCalled();
	});

	it("propagates a throwing migration so the caller can abort the transaction", () => {
		const later = vi.fn();
		const migrations = [
			synthMigration(0, () => {
				throw new Error("migration boom");
			}),
			synthMigration(1, later),
		];

		expect(() => runMigrations(fakeDb(), fakeTransaction(), 0, 2, migrations)).toThrow(
			"migration boom",
		);
		// The throw halts the run before any later migration applies.
		expect(later).not.toHaveBeenCalled();
	});
});
