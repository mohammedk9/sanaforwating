/**
 * اختبارات توزيع الفرق.
 * الهدف: توازن النتائج (الأقوى مع الأضعف)، توزيع كامل بلا تكرار،
 * وتجنّب تكرار زملاء الجولة السابقة.
 */
import { describe, expect, it } from 'vitest';
import { assignTeams, teamScore } from '../src/core/teams.ts';

const ids = (count: number) => Array.from({ length: count }, (_unused, i) => `p${i + 1}`);

/** نقاط متنازلة بحسب الترتيب: p1 الأعلى */
const descendingPoints = (list: string[]) =>
  Object.fromEntries(list.map((id, index) => [id, (list.length - index) * 100]));

describe('توزيع الفرق', () => {
  it('ستة لاعبين ⇒ ثلاثة فرق من لاعبين', () => {
    const players = ids(6);
    const teams = assignTeams({
      playerIds: players,
      teamSize: 2,
      pointsByPlayer: descendingPoints(players),
    });
    expect(teams).toHaveLength(3);
    expect(teams.every((team) => team.memberIds.length === 2)).toBe(true);
  });

  it('الأقوى يلعب مع الأضعف (الأول مع السادس، الثاني مع الخامس، الثالث مع الرابع)', () => {
    const players = ids(6);
    const teams = assignTeams({
      playerIds: players,
      teamSize: 2,
      pointsByPlayer: descendingPoints(players),
    });
    expect(teams[0].memberIds).toEqual(['p1', 'p6']);
    expect(teams[1].memberIds).toEqual(['p2', 'p5']);
    expect(teams[2].memberIds).toEqual(['p3', 'p4']);
  });

  it('كل لاعب يُوزَّع مرة واحدة فقط', () => {
    const players = ids(6);
    const teams = assignTeams({ playerIds: players, teamSize: 2 });
    expect(teams.flatMap((team) => team.memberIds).sort()).toEqual([...players].sort());
  });

  it('الناتج ثابت من نفس المدخلات (لا عشوائية مخفية)', () => {
    const players = ids(6);
    const first = assignTeams({ playerIds: players, teamSize: 2 });
    const second = assignTeams({ playerIds: players, teamSize: 2 });
    expect(second).toEqual(first);
  });

  it('خمسة لاعبين ⇒ فريقان بأحجام متقاربة وبلا لاعب ضائع', () => {
    const players = ids(5);
    const teams = assignTeams({ playerIds: players, teamSize: 2 });
    expect(teams).toHaveLength(2);
    expect(teams.map((team) => team.memberIds.length).sort()).toEqual([2, 3]);
    expect(teams.flatMap((team) => team.memberIds).sort()).toEqual([...players].sort());
  });

  it('سبعة لاعبين ⇒ ثلاثة فرق', () => {
    const players = ids(7);
    const teams = assignTeams({ playerIds: players, teamSize: 2 });
    expect(teams).toHaveLength(3);
    expect(teams.flatMap((team) => team.memberIds).sort()).toEqual([...players].sort());
  });

  it('لاعب واحد ⇒ فريق واحد', () => {
    const teams = assignTeams({ playerIds: ['p1'], teamSize: 2 });
    expect(teams).toHaveLength(1);
    expect(teams[0].memberIds).toEqual(['p1']);
  });

  it('لا فرق بلا لاعبين أو بحجم فريق غير صالح', () => {
    expect(assignTeams({ playerIds: [], teamSize: 2 })).toEqual([]);
    expect(assignTeams({ playerIds: ['p1'], teamSize: 0 })).toEqual([]);
  });

  it('يتجنّب تكرار زملاء الجولة السابقة', () => {
    const players = ids(6);
    const previousTeams = [
      { id: 'team-1', name: 'الفريق الأول', memberIds: ['p1', 'p6'] },
      { id: 'team-2', name: 'الفريق الثاني', memberIds: ['p2', 'p5'] },
      { id: 'team-3', name: 'الفريق الثالث', memberIds: ['p3', 'p4'] },
    ];

    const teams = assignTeams({
      playerIds: players,
      teamSize: 2,
      pointsByPlayer: descendingPoints(players),
      previousTeams,
    });

    for (const previous of previousTeams) {
      const [a, b] = previous.memberIds;
      const together = teams.some(
        (team) => team.memberIds.includes(a) && team.memberIds.includes(b),
      );
      expect(together).toBe(false);
    }
  });

  it('مجموع نقاط الفريق = مجموع نقاط أعضائه', () => {
    const team = { id: 'team-1', name: 'الفريق الأول', memberIds: ['p1', 'p2'] };
    expect(teamScore(team, { p1: 120, p2: 80 })).toBe(200);
    expect(teamScore(team, {})).toBe(0);
  });
});
