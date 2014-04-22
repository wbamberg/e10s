const Cc = Components.classes;
const Ci = Components.interfaces;
var console;

var WindowListener = {
  loadFrameScripts: function(window) {
    let document = window.document;

    console = window.console;

    let windowMM = window.messageManager;
    windowMM.loadFrameScript("chrome://my-e10s-extension/content/content.js", true);
    windowMM.addMessageListener("my-e10s-extension-message", listener);

    function listener(message) {
      //console.log(message.name);
      //console.log(message.sync);
      //console.log(message.data);
      //console.log(message.target);
      console.log(message.objects.element);
      message.objects.element.setAttribute("align", "center");
    }
  },

  // nsIWindowMediatorListener functions
  onOpenWindow: function(xulWindow) {
    // A new window has opened
    let domWindow = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                             .getInterface(Ci.nsIDOMWindow);

    // Wait for it to finish loading
    domWindow.addEventListener("load", function listener() {
      domWindow.removeEventListener("load", listener, false);

      // If this is a browser window then setup its UI
      if (domWindow.document.documentElement.getAttribute("windowtype") == "navigator:browser")
        WindowListener.loadFrameScripts(domWindow);
    }, false);
  },

  onCloseWindow: function(xulWindow) {
  },

  onWindowTitleChange: function(xulWindow, newTitle) {
  }
};

function startup(data, reason) {
  let wm = Cc["@mozilla.org/appshell/window-mediator;1"].
           getService(Ci.nsIWindowMediator);

  // Get the list of browser windows already open
  let windows = wm.getEnumerator(null);
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);

    WindowListener.loadFrameScripts(domWindow);
  }

  // Wait for any new browser windows to open
  wm.addListener(WindowListener);
}

function shutdown(data, reason) {
}