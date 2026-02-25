import axios from 'axios';

const ESPN_BASE_URL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons';

interface ESPNConfig {
  leagueId: string;
  seasonId: string;
  swid?: string;
  s2?: string;
}

export class ESPNFantasyAPI {
  private config: ESPNConfig;

  constructor(config: ESPNConfig) {
    this.config = config;
  }

  private getHeaders() {
    if (this.config.swid && this.config.s2) {
      // Strip any characters invalid in HTTP headers (non-printable, non-ASCII, quotes, whitespace)
      const clean = (s: string) => s.replace(/[^\x20-\x7E]/g, '').replace(/["']/g, '').trim();
      const swid = clean(this.config.swid);
      const s2 = clean(this.config.s2);
      console.log(`[espn] SWID length: ${swid.length}, S2 length: ${s2.length}`);
      return {
        Cookie: `SWID=${swid}; espn_s2=${s2}`,
      };
    }
    return {};
  }

  async fetchLeagueData(views: string[] = ['mTeam', 'mMatchup', 'mStandings']) {
    const url = `${ESPN_BASE_URL}/${this.config.seasonId}/segments/0/leagues/${this.config.leagueId}`;

    try {
      const response = await axios.get(url, {
        headers: this.getHeaders(),
        params: new URLSearchParams(views.map(v => ['view', v])),
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching ESPN data:', error);
      throw error;
    }
  }

  async fetchMatchups(matchupPeriodId?: number) {
    const views = ['mMatchup', 'mMatchupScore'];
    const params: Record<string, string | number> = { view: views.join(',') }; // unused path, kept for compat

    if (matchupPeriodId) {
      params.scoringPeriodId = matchupPeriodId;
    }

    const url = `${ESPN_BASE_URL}/${this.config.seasonId}/segments/0/leagues/${this.config.leagueId}`;

    try {
      const response = await axios.get(url, {
        headers: this.getHeaders(),
        params,
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching matchups:', error);
      throw error;
    }
  }

  async fetchFreeAgents(scoringPeriodId: number, limit = 100) {
    const url = `${ESPN_BASE_URL}/${this.config.seasonId}/segments/0/leagues/${this.config.leagueId}`;
    const filter = JSON.stringify({
      players: {
        filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
        limit,
        sortPercOwned: { sortAsc: false, sortPriority: 1 },
      },
    });

    try {
      const response = await axios.get(url, {
        headers: {
          ...this.getHeaders(),
          'X-Fantasy-Filter': filter,
        },
        params: new URLSearchParams([
          ['view', 'kona_player_info'],
          ['scoringPeriodId', String(scoringPeriodId)],
        ]),
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching free agents:', error);
      throw error;
    }
  }

  async fetchRoster(teamId: number, scoringPeriodId?: number) {
    const views = ['mRoster'];
    const params: Record<string, string | number> = {
      view: views.join(','),
      teamId,
    };

    if (scoringPeriodId) {
      params.scoringPeriodId = scoringPeriodId;
    }

    const url = `${ESPN_BASE_URL}/${this.config.seasonId}/segments/0/leagues/${this.config.leagueId}`;

    try {
      const response = await axios.get(url, {
        headers: this.getHeaders(),
        params,
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching roster:', error);
      throw error;
    }
  }
}

export function createESPNClient(seasonId?: string): ESPNFantasyAPI {
  return new ESPNFantasyAPI({
    leagueId: process.env.ESPN_LEAGUE_ID!,
    seasonId: seasonId || process.env.ESPN_SEASON_ID!,
    swid: process.env.ESPN_SWID,
    s2: process.env.ESPN_S2,
  });
}
