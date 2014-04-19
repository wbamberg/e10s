**

**Message managers provide a way for chrome-privileged JavaScript code to communicate across process boundaries. They are particularly useful for allowing chrome code, including the browser's own code and extension code, to access web content when the browser is running web content in a separate process.**

Firefox is written partly in C++ and partly in JavaScript. The JavaScript code, which includes the code to implement the Firefox user interface and code inserted by Firefox extensions, is commonly referred to as "chrome" code to distinguish it from the JavaScript code running in normal web pages, which is referred to as "content".

In current versions of desktop Firefox, chrome and content run in the same operating system process. So chrome code can access content directly:

    gBrowser.mCurrentBrowser.contentDocument.body.innerHTML = "replaced by chrome code";

However, in future versions of desktop Firefox, chrome code will run in a different process from content, and this kind of direct access will no longer be possible.

In multi-process Firefox, when chrome code needs to interact with web content, it needs to:
* factor the code that needs direct access to content into separate scripts, which are called "content scripts"
* use a message manager to load these content scripts into the content process
* use the message manager API to communicate with the content script

The message manager object defines four methods to enable this:

* `messageManager.loadFrameScript(url[, allowDelayedLoad])`: load a content script
* `messageManager.addMessageListener(messageName, listener)`: add a listener for messages from a content script
* `messageManager.removeMessageListener(messageName, listener)`: stop listening for a message
* `messageManager.sendAsyncMessage(messageName[, json])`: send a message to content scripts

*Note that none of this requires multi-process Firefox: everything described here will work with single-process Firefox, so the same code will work in both variants.*

## Types of message manager ##

There are three different types of message manager: the global message manager, the window message manager, and the browser message manager.

*Note that in this context, "browser" refers to the [XUL `<browser>` object](https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/browser), which is a frame that hosts a single Web document. It does not refer to the more general sense of a Web browser.*

### The global message manager ###

The global message manager operates on every [`<browser>`](https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/browser):

* `loadFrameScript` loads the given script into every `<browser>` in every chrome window
* `sendAsyncMessage` API sends the message to every `<browser>` in every chrome window

### The window message manager ###

The window message manager is associated with a specific chrome window, and operates on every `<browser>` loaded into the window:

* `loadFrameScript` loads the given script into every `<browser>` in the chrome window
* `sendAsyncMessage` API sends the message to every `<browser>` in the chrome window

### The browser message manager ###

The `<browser>` message manager is specific to a single XUL `<browser>` element (which essentially corresponds to a single tab):

* `loadFrameScript` loads the given script only into its `<browser>`
* `sendAsyncMessage` API sends the message only its `<browser>`

## Accessing a message manager ##

You can access the global message manager like this:

    // chrome script
    let globalMM = Cc["@mozilla.org/globalmessagemanager;1"]
                     .getService(Ci.nsIChromeFrameMessageManager);

The window message manager can be accessed as a property of the chrome window:

    // chrome script
    let windowMM = window.messageManager;

The browser message manager can be accessed as a property of the XUL `<browser>` element:

    // chrome script
    let browserMM = gBrowser.mCurrentBrowser.messageManager

## Loading content scripts ##

To load a content script use the `loadFrameScript` function:

    // chrome script
    messageManager.loadFrameScript("chrome://my-e10s-extension/content/content.js");

This takes one mandatory parameter, which is a chrome:// URL pointing to the content script you want to load. 

Extension developers can [register a chrome URL](https://developer.mozilla.org/en/docs/Chrome_Registration) to define the mapping between the URL and a content script packaged with the extension:

    // chrome.manifest
    content my-e10s-extension content.js

By default, `loadFrameScript` will only load the specified script into frames that are already open at the time the call is made, not any frames opened afterwards. But `loadFrameScript` takes an additional parameter `allowDelayedLoad`, which, if present and set to `true`, means that the content script will be loaded into any new frames opened after the `loadFrameScript` call.

    // chrome script
    // load script into current and future frames
    messageManager.loadFrameScript("chrome://my-e10s-extension/content/content.js", true);

## Content script environment ##

Content scripts have the following global objects:

* `content` - The DOM window of the content loaded in the browser.
* `docShell` - The nsIDocShell associated with the browser.
* `addMessageListener()` - listen to messages from chrome
* `removeMessageListener()` - stop listening to messages from chrome
* `sendAsyncMessage()` - send an asynchronous message to chrome
* `sendSyncMessage()` - send a synchronous message to chrome
* `dump()` - print a message to the console
* `atob()` - base64 decode
* `btoa()` - base64 encode

## Chome <-> content communication

Chrome code and content scripts communicate back and forth using a messaging API which can include JSON arguments.
Content scripts can send asynchronous or synchronous messages to chrome, but chrome can only send asynchronous messages to content. This is an intentional design decision made to prevent content code from making chrome code unresponsive.

Where absolutely necessary, content scripts can pass wrappers called Cross Process Object Wrappers (also known as CPOWs) to chrome, and chrome can use these wrappers to get synchronous access to content objects.

### Content to chrome

The content script can choose to send synchronous or asynchronous messages to chrome code.

To send an asychronous message the content script uses the global `sendAsyncMessage()` function:

    sendAsyncMessage("my-e10s-extension-message");

`sendAsyncMessage()` takes one mandatory parameter, which is the name of the message. After that it can pass detailed data as a JSONable object, and after that it can pass any objects it wants to pass to content as a CPOW. 

The example below sends a message named "my-e10s-extension-message", with a `data` payload containing `details` and `tag` properties, and exposes the `event.target` object as a CPOW:

   // content script
   addEventListener("click", function (event) {
     sendAsyncMessage("my-e10s-extension-message", {
       details : "they clicked",
       tag : event.target.tagName
     }, 
     {
        target : event.target
     });
    }, false);

To receive messages from content, a chrome script needs to add a message listener using the message manager's `addMessageListener()` API.

The message passed to the listener is an object containing the following properties:

* `name`: string containing the message name
* `sync`: boolean value declaring whether the message was send synchronously or aynchronously
* `data`: the JSON object passed as the second parameter
* `target`: the XUL `<browser>` element from which this message was sent
* `objects`: an object whose properties are any CPOWs exposed by the sender

In the example below the listener just logs all the messages details:

    // chrome script
    messageManager.addMessageListener("my-e10s-extension-message", listener);

    function listener(message) {
      console.log(message.name);
      console.log(message.sync);
      console.log(message.data);
      console.log(message.target);
      console.log(message.objects);
    }

Combining this message listener with the message above will give console output somewhat like this, when the user clicks a `<div>`:

    "my-e10s-extension-message"
    false
    Object { details: "they clicked", tag: "div" }
    <xul:browser anonid="initialBrowser" ... >
    { target: <div#searchContainer> }

To send a synchronous message, the content script uses the global `sendSyncMessage()` function. This returns an array of all the values returned from each listener:

    // content script
    addEventListener("click", function (event) {
      var results = sendSyncMessage("my-e10s-extension-message", {
        details : "they clicked",
        tag : event.target.tagName
      });
      content.console.log(results[0]);
    }, false);

To handle a synchronous message, the chrome script just returns the value from the message listener:

    // chrome script
    messageManager.addMessageListener("my-e10s-extension-message", listener);

    function listener(message) {
      return "this pleases chrome";
    }

### Chrome to content

## Cross Process Object Wrappers



************

