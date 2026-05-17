chrome.runtime.onInstalled.addListener(() => {
chrome.storage.local.set({ ignoredSites: [], lastScan: null });
console.log("Fraud-Sentry installed");
})