**

Message managers provide a way for chrome-privileged JavaScript code to communicate across process boundaries. They are particularly useful for allowing chrome code, including the browser's own code and extension code, to access web content when the browser is running web content in a separate process.

**

Firefox is written partly in C++ and partly in JavaScript. The JavaScript code, which includes the code to implement the Firefox user interface and code inserted by Firefox extensions, is commonly referred to as "chrome" code to distinguish it from the JavaScript code running in normal web pages, which is referred to as "content".

In current versions of desktop Firefox, chrome and content run in the same operating system process. So chrome code can access content directly:

    gBrowser.mCurrentBrowser.contentDocument.body.innerHTML = "replaced by chrome code";

However, in future versions of desktop Firefox, chrome code will run in a different process from content, and this kind of direct access will no longer be possible.

In multiprocess Firefox, when chrome code needs to interact with web content, it needs to:
* factor the code that needs direct access to content into separate scripts, called "content scripts"
* use a message manager to load these content scripts into the content process
* use the message manager API to communicate with the content script

Note that none of this requires multi-process Firefox: everything described here will work with single-process Firefox, so the same code will work in both variants.

## Message manager API overview ##

The message manager includes four methods:

* `messageManager.loadFrameScript(url[, allowDelayedLoad])`: load a content script
* `messageManager.addMessageListener(messageName, listener)`: add a listener for messages from a content script
* `messageManager.removeMessageListener(messageName, listener)`: stop listening for a message
* `messageManager.sendAsyncMessage(messageName[, json])`: send a message to content scripts

## Types of message manager ##

There are three different types of message manager: the global message manager, the window message manager, and the browser message manager.

Note that in this context, "browser" refers to the [XUL `<browser>` object](https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/browser), which is a frame that hosts a single Web document. It does not refer to the more general sense of a Web browser.

### The global message manager ###

The global message manager operates on every [`<browser>`](https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/browser):

* `loadFrameScript` loads the given script into every `<browser>` in every chrome window
* `sendAsyncMessage` API sends the message to every `<browser>` in every chrome window

### The window message manager ###

The window message manager is associated with a specific chrome window, and operates on every tab loaded into the window:

* `loadFrameScript` loads the given script into every `<browser>` in the window
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



Chrome code and content scripts communicate back and forth using a messaging API:
* you can pass JSON objects using this API, but not functions
* content scripts can send asynchronous or synchronous messages to chrome
* chrome can only send asynchronous messages to content: this is an intentional design decision made to prevent content code from making chrome code unresponsive
* where absolutely necessary, content scripts can pass wrappers called Cross Process Object Wrappers to chrome, and chrome can use these wrappers to get synchronous access to content objects.

### Content to chrome

### Chrome to content

************



gBrowser.mCurrentBrowser.contentDocument.body.addEventListener("click", function() {window.alert("you clicked");},false)

-> Error: cannot ipc non-cpow object

Message managers are separated into "parent side" and "child side". These don't always correspond to process boundaries, but can.  For each child-side message manager, there is always exactly one corresponding parent-side message manager that it sends messages to.  However, for each parent-side message manager, there may be more than one child-side managers it can message.

Message managers that always have exactly one "other side" are of type nsIMessageSender.  Parent-side message managers that have many "other sides" are of type nsIMessageBroadcaster.

Child-side message managers can send synchronous messages to their parent side, but not the other way around.

There are two realms of message manager hierarchies.  One realm
approximately corresponds to DOM elements, the other corresponds to
process boundaries.

Message managers corresponding to DOM elements
==============================================

In this realm of message managers, there are
 - "frame message managers" which correspond to frame elements
 - "window message managers" which correspond to top-level chrome
   windows
 - the "global message manager", on the parent side.  See below.

The DOM-realm message managers can communicate in the ways shown by
the following diagram.  The parent side and child side can
correspond to process boundaries, but don't always.

 Parent side                         Child side
-------------                       ------------
 global MMg
  |
  +-->window MMw1
  |    |
  |    +-->frame MMp1_1<------------>frame MMc1_1
  |    |
  |    +-->frame MMp1_2<------------>frame MMc1_2
  |    ...
  |
  +-->window MMw2
  ...

For example: a message sent from MMc1_1, from the child side, is
sent only to MMp1_1 on the parent side.  However, note that all
message managers in the hierarchy above MMp1_1, in this diagram
MMw1 and MMg, will also notify their message listeners when the
message arrives.

For example: a message broadcast through the global MMg on the
parent side would be broadcast to MMw1, which would transitively
broadcast it to MMp1_1, MM1p_2".  The message would next be
broadcast to MMw2, and so on down the hierarchy.

 **** PERFORMANCE AND SECURITY WARNING****
Messages broadcast through the global MM and window MMs can result
in messages being dispatched across many OS processes, and to many
processes with different permissions.  Great care should be taken
when broadcasting.

Interfaces
----------

The global MMg and window MMw's are message broadcasters implementing
nsIMessageBroadcaster while the frame MMp's are simple message senders
(nsIMessageSender). Their counterparts in the content processes are
message senders implementing nsIContentFrameMessageManager.

                   nsIMessageListenerManager
                 /                           \
nsIMessageSender                               nsIMessageBroadcaster
      |
nsISyncMessageSender (content process/in-process only)
      |
nsIContentFrameMessageManager (content process/in-process only)
      |
nsIInProcessContentFrameMessageManager (in-process only)


Message managers in the chrome process can also be QI'ed to nsIFrameScriptLoader.


Message managers corresponding to process boundaries
====================================================

The second realm of message managers is the "process message
managers".  With one exception, these always correspond to process
boundaries.  The picture looks like

 Parent process                      Child processes
----------------                    -----------------
 global PPMM
  |
  +<----> child PPMM
  |
  +-->parent PMM1<------------------>child process CMM1
  |
  +-->parent PMM2<------------------>child process PMM2
  ...

For example: the parent-process PMM1 sends messages directly to
only the child-process CMM1.

For example: CMM1 sends messages directly to PMM1.  The global PPMM
will also notify their message listeners when the message arrives.

For example: messages sent through the global PPMM will be
dispatched to the listeners of the same-process, "child PPMM".
They will also be broadcast to PPM1, PPM2, etc.

 **** PERFORMANCE AND SECURITY WARNING****
Messages broadcast through the global PPMM can result in messages
being dispatched across many OS processes, and to many processes
with different permissions.  Great care should be taken when
broadcasting.

Requests sent to parent-process message listeners should usually
have replies scoped to the requesting CPMM.  The following pattern
is common

 const ParentProcessListener = {
   receiveMessage: function(aMessage) {
     let childMM = aMessage.target.QueryInterface(Ci.nsIMessageSender);
     switch (aMessage.name) {
     case "Foo:Request":
       // service request
       childMM.sendAsyncMessage("Foo:Response", { data });
     }
   }
 };
/