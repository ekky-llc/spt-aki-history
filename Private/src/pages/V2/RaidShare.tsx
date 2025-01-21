// import { useLoaderData } from "react-router-dom";

import { useState } from "react"
import { useRaidReviewPrivateStore } from "../../store/private";

// export async function loader(loaderData: any) {

//     const raidId = loaderData.params.raidId as string;
//     let raid = await api.getRaid(raidId);
//     const intl = await api.getIntl();

//     const ls_globalSettingsKey = 'rr:global_settings';
//     const default_globalSettings = { translateCyrillic: true }
//     const ls_globalSettings = localStorage.getItem(ls_globalSettingsKey);

//     return { raidId, raid, intl, globalSettings: ls_globalSettings ? JSON.parse(ls_globalSettings) : default_globalSettings }
// }

export default function RaidShare() {

    const privateRaidReviewStore = useRaidReviewPrivateStore(s => s)

    //   const { raidId, raid, intl, globalSettings} = useLoaderData() as any;

    const [ title, setTitle ] = useState('');
    const [ description, setDescription ] = useState('');
    const [ uploadToken, setUploadToken ] = useState('');
    const [ tokenIsValid, setTokenIsValid ] = useState(false);

    // async function handleUpload() {

    //     // Validate 

    // }

    async function validateToken() {
        setTokenIsValid(true)
    }

    return (
        <div className="settings-container">
            <>
                <div className="text-eft font-mono overflow-x-auto">
                    <strong>Share Your Raid</strong>
                    <div className="grid grid-cols-[500px_auto] gap-4">
                        <div className="border border-eft p-2 flex flex-col gap-3">
                            <div className="flex flex-col">
                                <div>
                                    { title.trim() !== "" ? (<span>✅</span>): (<span>❌</span>)}
                                    <label className="ml-1" htmlFor="title">Title</label>
                                </div>
                                <input value={title} onChange={(e) => setTitle(e.target.value)} className="placeholder-gray-700 bg-black px-2 py-1 border border-eft" type="text" name="title" id="title" placeholder="Title..." required />
                            </div>

                            <div className="flex flex-col">
                                <div>
                                    { description.trim() !== "" ? (<span>✅</span>): (<span>❌</span>)}
                                    <label className="ml-1" htmlFor="description">Description</label>
                                </div>
                                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="placeholder-gray-700  bg-black px-2 py-1 border border-eft" rows={5} name="description" id="description" placeholder="Description..." required />
                            </div>

                            <div className="flex flex-col">
                                <div className="inline-block">
                                    <div className="inline-block">
                                        { tokenIsValid ? (<span>✅</span>): (<span>❌</span>)}
                                        <label className="ml-1" htmlFor="token">Upload Token</label>
                                    </div>
                                    {privateRaidReviewStore?.config?.public_hub_base_url && (
                                        <span className="ml-2">
                                            (<a className="underline underline-offset-2" href={`${privateRaidReviewStore.config.public_hub_base_url}/`} target="__blank">No Token? Generate One!</a>)
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-[80%_auto]">
                                    <input value={uploadToken} onChange={(e) => setUploadToken(e.target.value)} className="placeholder-gray-700 bg-black px-2 py-1 border border-eft" type="text" name="token" id="token" placeholder="00000000-0000-0000-0000-000000000000" required />
                                    <button onClick={validateToken} className="py-1 px-4 bg-eft h-full border border-eft w-fit text-sm text-black hover:opacity-75">
                                        Validate
                                    </button>
                                </div>
                            </div>
                            
                            <button className={`py-1 px-4 bg-eft text-sm text-black ${tokenIsValid && title && description ? 'hover:opacity-75' : 'opacity-25 cursor-not-allowed'}`}>
                                Start Upload
                            </button>
                        </div>
                        <div className="border border-eft p-2"> 
                            <strong>Instructions</strong> 
                            <div className="text-sm mb-4">
                                <p>
                                    Add your title, description and ensure you enter your upload token, which you can generate via the {privateRaidReviewStore?.config?.public_hub_base_url ? (<a className="underline underline-offset-2" href={`${privateRaidReviewStore.config.public_hub_base_url}/get-token`} target="__blank">public hub</a>) : 'public hub'}.
                                </p>
                            </div>
                            { typeof privateRaidReviewStore?.config?.public_hub_base_url === 'string' && privateRaidReviewStore.config.public_hub_base_url.includes('raid-review.online') && ( 
                                <>
                                    <strong>Quick Message</strong> 
                                    <div className="text-sm">
                                        <p> 
                                            This project, servers and storage is maintained and funded through my own money (plus donations recieved).
                                        </p>
                                        <p className="mt-3"> 
                                            I've set upload limits to <strong className="underline underline-offset-4">1 raid at a time per user</strong> so I can ensure things dont get out of control, and to prevent my credit-card from being eaten alive.
                                        </p>
                                        <p className="mt-3"> 
                                            If you’d like to increase this limit for your own account, here are options available to you: <a className="underline underline-offset-2" href="https://raid-review.online/upgrade" target="__blank">https://raid-review.online/#upgrade</a>
                                        </p>
                                        <p className="mt-3"> 
                                            Thank you for understanding, and I hope this feature helps or provides entertainment somehow.
                                        </p>
                                        <p className="mt-3"> 
                                            - Ekky
                                        </p>                                
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </>
        </div>
    )
}
