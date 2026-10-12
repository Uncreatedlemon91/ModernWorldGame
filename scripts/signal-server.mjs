// Optional self-hosted PeerJS signalling server. Players only use it to find each
// other; game traffic flows directly between browsers over WebRTC.
//
//   npm run signal            # listens on :9000
//   PORT=9443 npm run signal
//
// Then in the game: Main menu → Network settings →
//   {"host":"your.server","port":9000,"path":"/","secure":false}
// or open the game with ?signal=http://your.server:9000/
import { PeerServer } from 'peer';

const port = Number(process.env.PORT || 9000);
PeerServer({ port, path: '/', allow_discovery: false, proxied: Boolean(process.env.PROXIED) });
console.log(`Modern World signalling server listening on :${port}`);
