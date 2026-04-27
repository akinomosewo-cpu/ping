export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["favicon.svg","icon-192.png","icon-512.png","manifest.json"]),
	mimeTypes: {".svg":"image/svg+xml",".png":"image/png",".json":"application/json"},
	_: {
		client: {start:"_app/immutable/entry/start.CpeI6J9-.js",app:"_app/immutable/entry/app.BYWSCniP.js",imports:["_app/immutable/entry/start.CpeI6J9-.js","_app/immutable/chunks/BisfAEKK.js","_app/immutable/chunks/KcjoaZKZ.js","_app/immutable/entry/app.BYWSCniP.js","_app/immutable/chunks/KcjoaZKZ.js","_app/immutable/chunks/DLjrMD4S.js","_app/immutable/chunks/BEgYEWwW.js","_app/immutable/chunks/Bbyyg9ME.js","_app/immutable/chunks/nh3W7Oip.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('../output/server/nodes/0.js')),
			__memo(() => import('../output/server/nodes/1.js')),
			__memo(() => import('../output/server/nodes/2.js')),
			__memo(() => import('../output/server/nodes/3.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/dashboard",
				pattern: /^\/dashboard\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
