import { gunzip } from "zlib";
import { promisify } from "util";
import _, { head } from 'lodash';

import { account } from "./controller/account";
import { raid } from "./controller/raid";
import { supabaseConnect } from "./controller/supabase";
import { positionalData, RaidShareDatafile, RaidUploadPayload, validateRaidShareDatafile, validateRaidSharePayload } from "./utils/validate";
import { generateInterpolatedFramesBezier } from "./utils/interpolation";
import { MEMBERSHIP_UPLOAD_LIMITS } from "./CONSTANTS";

const gunzipAsync = promisify(gunzip);

export default {
	async fetch(request, env: Env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		// Cors
		if (request.method === 'OPTIONS') {
			return new Response(null, {
			  status: 204,
			  headers: {
				'Access-Control-Allow-Credentials': 'true',
				'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Headers': 'Content-Type'
			  }
			});
		}

		const headers = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Content-Type' : 'application/json'
		}

		const supabase = supabaseConnect(env.SUPABASE_URL, env.SUPABASE_KEY);
		const routes: Array<{ method: string, human: string, pattern: RegExp; handler: (params: Record<string, string>, request: Request) => Promise<Response> }> = [

			// Raid Endpoints
			{
				method: 'GET',
				human: '/api/v1/raid/all',
				pattern: /^\/api\/v1\/raid\/all/, 
				handler: async () => {
					const data = await raid.getRaids(supabase, 7);
					return new Response(JSON.stringify(data), {
						headers
					});
				},
			},
			{
				method: 'POST',
				human: '/api/v1/raid/receive',
				pattern: /^\/api\/v1\/raid\/receive/, 
				handler: async (params) => {
					try {


						  const contentType = request.headers.get('Content-Type') || '';
						  if (!contentType.includes('multipart/form-data')) return new Response("Invalid Content-Type", { status: 400 });
				  
						  const formData = await request.formData();
						  const file = formData.get('file') as File;
						  const payloadJson = formData.get('payload') as string;

						  if (!file || !(file instanceof File)) return new Response("File is required", { status: 400 });
						  if (!payloadJson) return new Response("Payload is required", { status: 400 });
						  if (!payloadJson || typeof payloadJson !== 'string') return new Response("Payload is required and must be a valid JSON string", { status: 400 });

						  let payload;
						  try {
							  payload = JSON.parse(payloadJson) as RaidUploadPayload;
						  } catch (err) {
							  return new Response("Invalid JSON in payload", { status: 400 });
						  }

						  const payloadValidationErrors = validateRaidSharePayload(payload);
						  if (payloadValidationErrors.length > 0) return new Response("Invalid payload", { status: 400 });

						  const accountDetails = await account.getAccountByUploadToken(supabase, payload.uploadToken);
						  if (!accountDetails) return new Response("Invalid token or banned", { status: 400 });

						  let raids = await raid.getUsersRaids(supabase, accountDetails.id, true) as number;
						  let limit = MEMBERSHIP_UPLOAD_LIMITS[accountDetails.membership];

						  // Check if the user has opted to overwrite the oldest raids (i.e. delete the oldest raids to make room for the new one)
						  if (payload.overwriteOldest) {
							const numberOfRaidsToDelete = (raids - limit) + 1;
							const raidDataToDelete = await raid.deleteOldestRaids(supabase, accountDetails.id, numberOfRaidsToDelete);
							if (raidDataToDelete) {
								for (let i = 0; i < raidDataToDelete.length; i++) {
									const raid = raidDataToDelete[i];
									await env.RAID_REVIEW.delete(raid.storageKey);
								}
							}

							// Update the count of raids after deletion
							raids = raids - numberOfRaidsToDelete;
						  }

						  if (raids >= limit) return new Response("Upload limit reached", { status: 429 });
	  
						  const compressedBuffer = await file.arrayBuffer();
						  const decompressedBuffer = await gunzipAsync(Buffer.from(compressedBuffer));  

						  let decompressedData;
						  try {
							  decompressedData = JSON.parse(decompressedBuffer.toString());
						  } catch (err) {
							  return new Response("Decompressed data is not valid JSON", { status: 400 });
						  }

						  const dataValidationErrors = validateRaidShareDatafile(decompressedData);
						  if (dataValidationErrors.length > 0) return new Response("Invalid payload", { status: 400 });

						  const r2Key = `raids/${payload.uploadToken}/${file.name}`;
						  await env.RAID_REVIEW.put(r2Key, compressedBuffer); 

						  await raid.saveRaid(supabase, payload, accountDetails?.discordUsername, accountDetails?.id, r2Key);
						  
						  return new Response(
						  	  JSON.stringify({ success: true }),
						  	  { status: 200, headers }
						  );
					  }
					  
					  catch (error) {
						  console.error("Error processing upload:", error);
						  return new Response("Internal Server Error", { status: 500 });
					  }
				},
			},
			{
				method: 'GET',
				human: '/api/v1/raid/:raidId',
				pattern: /^\/api\/v1\/raid\/(?<raidId>[^/]+)$/,
				handler: async (params) => {
					try {
						const raidMetadata = await raid.getRaid(supabase, params.raidId);
						if (!raidMetadata) {
							console.log(`Could not locate Metadata for RaidID: '${params.raidId}'.`)
							return new Response(null , { status: 204 })
						};

						const raidDataR2Response = await env.RAID_REVIEW.get(raidMetadata.storageKey);
						if (!raidDataR2Response) {
							console.log(`Could not locate R2 Data for RaidID: '${params.raidId}'.`)
							return new Response(null , { status: 204 });
						}
						const uncompressed = await gunzipAsync(Buffer.from(await raidDataR2Response.arrayBuffer()));

						const raidDataBundle = await JSON.parse(uncompressed.toString()) as RaidShareDatafile
						const raidData = raidDataBundle.raid;
						
						return new Response(JSON.stringify(raidData), { 
							status: 200,  
							headers: {
								...headers,
								"Cache-Control": "public, max-age=3600"
							}
						});
					}

					catch (error) {
						return new Response("Internal Server Error", { status: 500 });
					}
				},
			},
			{
				method: 'GET',
				human: '/api/v1/raid/:raidId/positions',
				pattern: /^\/api\/v1\/raid\/(?<raidId>[^/]+)\/positions$/,
				handler: async (params) => {
					try {
						const raidMetadata = await raid.getRaid(supabase, params.raidId);
						if (!raidMetadata) {
							console.log(`Could not locate Metadata for RaidID: '${params.raidId}'.`)
							return new Response(null , { status: 204 })
						};

						const raidDataR2Response = await env.RAID_REVIEW.get(raidMetadata.storageKey);
						if (!raidDataR2Response) {
							console.log(`Could not locate R2 Data for RaidID: '${params.raidId}'.`)
							return new Response(null , { status: 204 });
						}
						const uncompressed = await gunzipAsync(Buffer.from(await raidDataR2Response.arrayBuffer()));

						const raidDataBundle = await JSON.parse(uncompressed.toString()) as RaidShareDatafile
						const raidData = raidDataBundle.positions;

						const interpolated = generateInterpolatedFramesBezier(raidData, 5, 24)
						
						return new Response(JSON.stringify(interpolated), { 
							status: 200,  
							headers: {
								...headers,
								"Cache-Control": "public, max-age=3600"
							}
						});
					}

					catch (error) {
						return new Response("Internal Server Error", { status: 500 });
					}
				},
			},
			{
				method: 'GET',
				human: '/api/v1/raid/:raidId/heatmap',
				pattern: /^\/api\/v1\/raid\/(?<raidId>[^/]+)\/positions\/heatmap$/,
				handler: async (params) => {
					try {
						const raidMetadata = await raid.getRaid(supabase, params.raidId);
						if (!raidMetadata) {
							console.log(`Could not locate Metadata for RaidID: '${params.raidId}'.`)
							return new Response(null , { status: 204 })
						};

						const raidDataR2Response = await env.RAID_REVIEW.get(raidMetadata.storageKey);
						if (!raidDataR2Response) {
							console.log(`Could not locate R2 Data for RaidID: '${params.raidId}'.`)
							return new Response(null , { status: 204 });
						}
						const uncompressed = await gunzipAsync(Buffer.from(await raidDataR2Response.arrayBuffer()));

						const raidDataBundle = await JSON.parse(uncompressed.toString()) as RaidShareDatafile
						const raidData = raidDataBundle.positions;

						const interpolated = generateInterpolatedFramesBezier(raidData, 5, 24)

						const flattenedData = _.chain(interpolated).valuesIn().flatMapDeep().value() as unknown as positionalData[];
    
						const points = flattenedData.map(entry => [entry.z, entry.x, 1]);
						const pointMap = new Map();
						points.forEach(([z, x]) => {
							const key = `${z},${x}`;
							if (pointMap.has(key)) {
								if (pointMap.get(key)[2] < 1) {
									pointMap.get(key)[2] += 1;
								}
							} else {
								pointMap.set(key, [z, x, 1]);
							}
						});
				
						const aggregatedPoints = Array.from(pointMap.values());
						
						return new Response(JSON.stringify(aggregatedPoints), { 
							status: 200,  
							headers: {
								...headers,
								"Cache-Control": "public, max-age=3600"
							}
						});
					}

					catch (error) {
						return new Response("Internal Server Error", { status: 500 });
					}
				},
			},

			// Account Endpoints
			{
				method: 'GET',
				human: '/api/v1/account/:discordId',
				pattern: /^\/api\/v1\/account\/(?<discordId>[^/]+)$/,
				handler: async (params) => {
					const data = await account.getAccount(supabase, params.discordId);

					if (data === undefined) {
						const response =  new Response(null , { status: 204 });
						return response;
					}

					return new Response(JSON.stringify(data), {
						headers
					});
				},
			},
			{
				method: 'POST',
				human: '/api/v1/verify-token',
				pattern: /^\/api\/v1\/verify-token/,
				handler: async () => {

					const payload = await request.json() as { uploadToken: string };
					const data = await account.getAccountByUploadToken(supabase, payload.uploadToken);

					if (data === undefined) return new Response(null , { status: 404 });

					const raids = await raid.getUsersRaids(supabase, data.id, true) as number;
					const limit = MEMBERSHIP_UPLOAD_LIMITS[data.membership];
					const response_payload = {
						raids,
						limit
					};

					return new Response(JSON.stringify(response_payload), {
						headers
					});
				},
			},
			{
				method: 'POST',
				human: '/api/v1/account/register',
				pattern: /^\/api\/v1\/account\/register/, 
				handler: async (params) => {

					const payload = await request.json() as { accessToken: string };
					if (!payload.accessToken) {
						const response =  new Response(`There was a problem registering your account.`, {
							status: 400,
							headers
						});
						return response;
					}

					const data = await account.registerAccount(supabase, payload.accessToken);
					return new Response(JSON.stringify(data), {
						headers
					});
				},
			}
		];


		for (const route of routes) {
			const match = path.match(route.pattern);
			if (match && request.method === route.method) {
				// Extract named groups directly
				const params = match.groups || {};
				return await route.handler(params, request);
			}
		}

		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;