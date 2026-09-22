// The toolbar button opens the reader page in a new tab
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('reader.html') }))
