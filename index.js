WebSocket = require("ws");

const {
  Game,
  SpriteDirection,
  MoveDirection,
  WirePoint,
  PlayerStatusOption,
} = require("@gathertown/gather-game-client");
const Koa = require("koa");
const app = new Koa();

const SPACE_ID = process.env.GATHER_SPACE_ID,
  API_KEY = process.env.GATHER_API_KEY,
  HOME_MAP_ID = "Home 2",
  WATER_STATION_NAME = "Water Station",
  KITCHEN_NAME = "Kitchen";

const game = new Game(SPACE_ID, () =>
  Promise.resolve({
    apiKey: API_KEY,
  })
);

var isConnected = false,
  init = false,
  playerID;

const climbingCoords = {
  x: 99,
  y: 66,
};

game.connect();
game.subscribeToConnection((connected) => {
  isConnected = connected;
});
async function ensureConnected(callback) {
  if (!isConnected) {
    await new Promise((resolve) => {
      game.subscribeToConnection((connected) => {
        if (connected) {
          resolve();
        }
      });
    });
  }
  if (!init) {
    init = true;
    await game.waitForInit();
    const p = game.getMyPlayer();
    playerID = p.id;
  }
  return callback();
}

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function randomCoord(coords) {
  const players = game.getPlayersInMap(HOME_MAP_ID);
  const validCoords = coords.filter((c) =>
    players.reduce((acc, p) => acc && p.x != c.x && p.y != c.y, true)
  );
  return validCoords[Math.floor(Math.random() * validCoords.length)];
}

function closestToPlayer(coords) {
  const p = game.getMyPlayer();
  return coords.sort((c1, c2) => dist(c1, p) - dist(c2, p))[0];
}

var lastKnownLocation;

app.use(async (ctx) => {
  return await ensureConnected(() => {
    const p = game.getMyPlayer();
    const map = game.partialMaps[HOME_MAP_ID];
    const nooks = Object.values(map.nooks);

    function _teleport(coords, spriteDirection) {
      game.teleport(
        HOME_MAP_ID,
        coords.x,
        coords.y,
        playerID,
        spriteDirection || SpriteDirection.Up
      );
    }

    function teleport(coords, spriteDirection) {
      lastKnownLocation = {
        x: p.x,
        y: p.y,
      };
      _teleport(coords, spriteDirection);
    }

    function safeTeleport(coords, spriteDirection) {
      if (!p.isAlone) {
        return;
      }
      lastKnownLocation = {
        x: p.x,
        y: p.y,
      };
      _teleport(coords, spriteDirection);
    }

    WirePoint;
    switch (ctx.request.path) {
      case "/return":
        if (lastKnownLocation) {
          _teleport(lastKnownLocation);
        }
        game.setAvailability(PlayerStatusOption.Available);
        game.setTextStatus(process.env.GATHER_DEFAULT_STATUS);
        game.setEmojiStatus(process.env.GATHER_DEFAULT_EMOJI);
        break;
      case "/desk":
        const desk = p.deskInfo;
        const deskCoords = closestToPlayer(
          map.nooks[desk.deskId].nookCoords.coords
        );
        teleport(deskCoords);
        break;
      case "/kitchen":
        const kitchenCoord = randomCoord(
          nooks
            .filter((n) => n.name == KITCHEN_NAME)
            .flatMap((n) => n.nookCoords.coords)
        );
        safeTeleport(kitchenCoord);
        break;
      case "/toilet":
        const toiletCoord = closestToPlayer(
          nooks
            .filter((n) => n.name == WATER_STATION_NAME)
            .flatMap((n) => n.nookCoords.coords)
        );
        safeTeleport(toiletCoord);
        break;
      case "/workout":
        safeTeleport(climbingCoords, SpriteDirection.Up);
        break;
      case "/dance":
        for (const p of game.getPlayersInMap(HOME_MAP_ID)) {
          game.move(MoveDirection.Dance, false, p.id);
          game.shootConfetti(p.id);
        }
        break;
      case "/private":
        const privateCoord = randomCoord(
          nooks
            .filter((n) => n.name.match(/private(\s?\d*)?/))
            .flatMap((n) => n.nookCoords.coords)
        );
        teleport(privateCoord);
        break;
      case "/status":
        const { emoji, text } = ctx.query;
        console.log(emoji, text);
        if (emoji) {
          game.setEmojiStatus(emoji);
        }
        if (text) {
          game.setTextStatus(text);
        }
        break;
      case "/availability":
        const { name } = ctx.query;
        switch (name) {
          case "available":
            game.setAvailability(PlayerStatusOption.Available);
            break;
          case "dnd":
            game.setAvailability(PlayerStatusOption.DoNotDisturb);
            break;
          case "busy":
            game.setAvailability(PlayerStatusOption.Busy);
            break;
        }
        break;
      default:
        return;
    }
    ctx.status = 200;
  });
});
app.listen(process.env.PORT || 3000);
