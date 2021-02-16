
const {chat: {sanitize}, time: {debounce}} = OMEGGA_UTIL;

// time between setting home
const SET_HOME_COOLDOWN = 60 * 1000;

// time between listing warps
const WARPS_PAGE_COOLDOWN = 1 * 1000;

// number of warps per page
const PAGE_SIZE = 5;

const colorKey = (color, str) => `<color=\\"${color}\\">${sanitize(str + '')}</>`;
const yellow = str => colorKey('ffff99', str);
const grey = str => colorKey('999999', str);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

module.exports = class Warps {
  constructor(omegga, config, store) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;

    this.cooldowns_warp = {}; // cooldown tracking for warping places
    this.cooldowns_setHome = {}; // cooldown tracking for setting home
    this.cooldowns_page = {}; // cooldown tracking for pagination
    this.clearWarpsCooldown = 0;
    this.warps = {}; // cached warps
    this.homes = {}; // cached homes
  }

  // check if a name is authorized
  isAuthorized(name) {
    const player = Omegga.getPlayer(name);
    return player.isHost() || this.config['authorized-users'].some(p => player.id === p.id);
  }

  // sanitize a warp name
  static cleanName(args) {
    return args.join(' ').replace(/[^a-zA-Z0-9."'!@#% -]/g, '').trim();
  }

  // teleport a player to a position
  static teleport(name, [x, y, z]) {
    Omegga.writeln(`Chat.Command /TP "${name}" ${x} ${y} ${z}`);
  }

  // check a cooldown
  cooldown(name, type, duration) {
    if (duration === 0) return true;
    const obj = this['cooldowns_' + type];
    const lastTime = obj[name] || 0;
    if (lastTime + duration > Date.now()) {
      Omegga.whisper(name, '"You are doing that too fast."');
      return false;
    }
    obj[name] = Date.now();
    return true;
  }

  async init() {
    let {
      'home-enabled': isHomeEnabled,
      'warp-enabled': isWarpEnabled,
      'warp-cooldown': warpCooldown,
    } = this.config;

    warpCooldown = Math.max(warpCooldown, 0) * 1000;

    this.warps = (await this.store.get('warps')) || [];

    Omegga
      .on('cmd:setwarp', async(name, ...args) => {
        const auth = this.isAuthorized(name);
        if (!auth) return;
        const dest = Warps.cleanName(args);
        const old = this.warps.find(w => w.name === dest);

        const player = Omegga.getPlayer(name);
        try {
          const pos = await player.getPosition();
          // store warp in cache and store
          if (old)
            old.pos = pos;
          else
            this.warps.push({name: dest, pos});
          await this.store.set('warps', this.warps);

          Omegga.whisper(player, `"Warp ${yellow(dest)} set. Use ${yellow('/warp ' + dest)} to warp."`);
        } catch (e) {
          // player was not found... who cares
        }

      })
      .on('cmd:delwarp', async(name, ...args) => {
        const auth = this.isAuthorized(name);
        if (!auth) return;

        const dest = Warps.cleanName(args);
        const warp = this.warps.findIndex(w => w.name === dest);
        if (warp === -1)
          return Omegga.whisper(name, `"A warp by that name does not exist. See available warps with ${yellow('/warps')}."`);

        this.warps.splice(warp, 1);
        await this.store.set('warps', this.warps);

        Omegga.whisper(name, `"Warp ${yellow(dest)} deleted."`);
      })
      .on('cmd:clearwarps', async name => {
        const auth = this.isAuthorized(name);
        if (!auth) return;
        if (this.clearWarpsCooldown + 5000 > Date.now()) {
          await this.store.wipe();
          this.warps = [];
          this.homes = {};
          Omegga.broadcast('"Cleared all warps and homes."');
          this.clearWarpsCooldown = 0;
        } else {
          this.clearWarpsCooldown = Date.now();
          Omegga.whisper(name, `"Send ${yellow('/clearwarps')} again within ${yellow('5 seconds')} to confirm. This will clear all warps and homes."`);
        }
      })
      .on('cmd:warp', (name, ...args) => {
        const auth = this.isAuthorized(name);
        if (!auth && (!isWarpEnabled || !this.cooldown(name, 'warp', warpCooldown))) return;
        if (args.length === 0) return Omegga.whisper(name, `"See available warps with ${yellow('/warps')}."`);

        const dest = Warps.cleanName(args);
        const warp = this.warps.find(w => w.name === dest) || this.warps.find(w => w.name.toLowerCase() === dest.toLowerCase());
        if (!warp)
          return Omegga.whisper(name, `"A warp by that name does not exist. See available warps with ${yellow('/warps')}."`);

        Warps.teleport(name, warp.pos);
      })
      .on('cmd:warps', async(name, arg) => {
        const auth = this.isAuthorized(name);
        if (!auth && (!isWarpEnabled || !this.cooldown(name, 'page', WARPS_PAGE_COOLDOWN))) return;

        // get the player pos (to sort warps by distance)
        let pos;
        let sorted = this.warps.slice();
        try {
          pos = await Omegga.getPlayer(name).getPosition();
          sorted = sorted.sort((a, b) => {
            return dist(a.pos, pos) - dist(b.pos, pos);
          });
        } catch (e) {
          // player not found
        }

        // max page count
        const pages = Math.ceil(this.warps.length / PAGE_SIZE);
        // current page (parse argument as a number, default to 1, cap at page count)
        const page = Math.max(Math.min(arg && arg.match(/^\d+$/) ? parseInt(arg) : 1, pages), 1) - 1;
        const offset = page * PAGE_SIZE;

        // save count is nonzero - print out a page from most recent saves first
        if (this.warps.length !== 0) {
          // this code looks like garbages, iterate through the saves at an offset
          // also limit the output
          for (let i = 0; i < PAGE_SIZE && i + offset < this.warps.length; i++) {
            const warp = sorted[i + offset];
            // print out save id, date, and age
            Omegga.whisper(name, `"- ${yellow(warp.name)} ${pos ? grey(`[${Math.round(dist(pos, warp.pos)/10)}st]`) : ''}"`);
          }
          // print out pagination info
          Omegga.whisper(name, `"Page ${yellow(page + 1)} of ${yellow(pages)}. (${yellow(this.warps.length)} total)"`);
        } else {
          Omegga.whisper(name, '"No available warps."');
        }
      })
      .on('cmd:home', async(name, ...args) => {
        const auth = this.isAuthorized(name);
        if (!auth && (!isHomeEnabled || !this.cooldown(name, 'warp', warpCooldown))) return;

        let player;

        // if there are args provided by an authorized player, lookup the target
        if (auth && args.length > 0) {
          player = Omegga.findPlayerByName(args.join(' '));
          if (!player) {
            return Omegga.whisper(player, '"Could not find an online player by that name."');
          }
        } else {
          player = Omegga.getPlayer(name);
        }

        const { id } = player;

        // find the player's home by player id
        const home = this.homes[id] = (typeof this.homes[id] === 'undefined'
          ? await this.store.get('home_' + id)
          : this.homes[id]);

        if (!home) {
          return Omegga.whisper(name, '"No home has been set."');
        }

        Warps.teleport(name, home);
      })
      .on('cmd:sethome', async name => {
        const auth = this.isAuthorized(name);
        if (!auth && (!isHomeEnabled || !this.cooldown(name, 'setHome', SET_HOME_COOLDOWN))) return;
        const player = Omegga.getPlayer(name);
        try {
          const pos = await player.getPosition();
          // store home in cache and store
          this.homes[player.id] = pos;
          await this.store.set('home_' + player.id, pos);

          Omegga.whisper(player, `"Home warp has been set. Use ${yellow('/home')} to teleport home."`);
        } catch (e) {
          // player was not found... who cares
        }
      });

    return {
      registeredCommands: ['setwarp', 'delwarp', 'clearwarps', 'warps', 'warp', 'sethome', 'home'],
    };
  }

  async stop() {

  }
};
