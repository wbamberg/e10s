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

* The global message manager operates on every [`<browser>`](https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/browser): `loadFrameScript` loads the given script into every `<browser>` in every chrome window, and `sendAsyncMessage` sends the message to every `<browser>` in every chrome window.

* The window message manager is associated with a specific chrome window, and operates on every `<browser>` loaded into the window: `loadFrameScript` loads the given script into every `<browser>` in the chrome window, and `sendAsyncMessage` sends the message to every `<browser>` in the chrome window

* The browser message manager is specific to a single XUL `<browser>` element (which essentially corresponds to a single tab): `loadFrameScript` loads the given script only into its `<browser>`, and `sendAsyncMessage` sends the message only to that `<browser>`.

You can mix and match: so for example, you could load a script into every `<browser>` using the global message manager, but then send a message to the script instance loaded into a specific `<browser>` using the browser message manager.


## Accessing a message manager ##

You can access the global message manager like this:

    // chrome script
    let globalMM = Cc["@mozilla.org/globalmessagemanager;1"].getService(Ci.nsIMessageListenerManager);

The window message manager can be accessed as a property of the chrome window:

    // chrome script
    let windowMM = window.messageManager;

The browser message manager can be accessed as a property of the XUL `<browser>` element:

    // chrome script
    let browserMM = gBrowser.mCurrentBrowser.messageManager

## Loading content scripts ##

To load a content script use the `loadFrameScript` function:

    // chrome script
    messageManager.loadFrameScript("chrome://my-e10s-extension/content/content.js", true);

This takes two mandatory parameters:

* a `chrome://` URL pointing to the content script you want to load
* a boolean flag `allowDelayedLoad`

Extension developers can [register a chrome URL](https://developer.mozilla.org/en/docs/Chrome_Registration) to define the mapping between the `chrome://` URL and a content script packaged with the extension:

    // chrome.manifest
    content my-e10s-extension content.js

The `allowDelayedLoad` flag, if `true`, means that the content script will be loaded into any new frames opened after the `loadFrameScript` call.

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

To send an asynchronous message the content script uses the global `sendAsyncMessage()` function:

    sendAsyncMessage("my-e10s-extension-message");

`sendAsyncMessage()` takes one mandatory parameter, which is the name of the message. After that it can pass detailed data as string or a JSONable object, and after that it can pass any objects it wants to pass to content as CPOWs. 

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

To handle a synchronous message from content, the chrome script needs to return the value from the message listener:

    // chrome script
    messageManager.addMessageListener("my-e10s-extension-message", listener);

    function listener(message) {
      return "this pleases chrome";
    }

To stop listening for messages from content, use the message manager's `removeMessageListener()` method:

    // chrome script
    messageManager.removeMessageListener("my-e10s-extension-message", listener);

### Chrome to content

To send a message from chrome to content, use the message manager's `sendAsyncMessage()` method:

    // chrome script
    messageManager.sendAsyncMessage("message-from-chrome");

The message takes one mandatory parameter, which is the message name. After that it can pass detailed data as a string or a JSONable object:

    // chrome script
    messageManager.sendAsyncMessage("message-from-chrome", "message-payload");
    messageManager.sendAsyncMessage("message-from-chrome", { details : "some more details"} );

To receive a message from chrome, a content script uses the global `addMessageListener()` function. This takes two parameters: the name of the message and a listener function. The listener will be passed a `message` object whose `data` property is the message payload:

    // content script
    function handMessageFromChrome(message) {
      var payload = message.data.details;      // "some more details"
    }

    addMessageListener("message-from-chrome", handMessageFromChrome);

## Cross Process Object Wrappers

Chrome to content messaging must be asynchronous: `sendSyncMessage()` is not available to chrome. This is because the chrome process runs the Firefox UI, so if it were blocked by the content process, then a slow content process could cause Firefox to become unresponsive to users.

Converting synchronous code to be asynchronous can be difficult and time-consuming. As a migration aid, the messaging framework enables content scripts to make content objects available to chrome through a wrapper called a Cross Process Object Wrapper.

Content scripts pass these objects using the third parameter to `sendAsyncMessage()` or `sendSyncMessage()`. For example, this content script sends a DOM node to chrome when the user clicks it:

    // content script
    addEventListener("click", function (event) {
      sendAsyncMessage("my-e10s-extension-message", {}, { element : event.target });
    }, false);

In the chrome script, the DOM node is now accessible through a Cross Process Object Wrapper, as a property of the `objects` property of the message. The chrome script can get and set this object's properties, and call its functions:

    // chrome script
    windowMM.addMessageListener("my-e10s-extension-message", handleMessage);

    function handleMessage(message) {
      let wrapper = message.objects.element
      console.log(wrapper.innerHTML);
      wrapper.innerHTML = "<h2>Modified by chrome!</h2>"
      wrapper.setAttribute("align", "center");
    }

### Limitations ###

Although these wrappers 

* Performance
* Message order
* Can't pass functions

In the chrome script these look just like content objects, with some significant differences, but they are implemented as wrappers over the process boundary.

However, in cases where chrome code absolutely needs synchronous access to content, the content script can send special objects called Cross Process Object Wrappers to chrome.

Cross Process Object Wrappers are objects

## An example ##



