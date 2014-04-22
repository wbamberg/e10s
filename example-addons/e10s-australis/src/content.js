
addMessageListener("get-elements", sendElements);

function sendElements(message) {

/*let console = content.console;
      console.log("name: " + message.name);
      console.log("sync: " + message.sync);
      console.log("data: " + message.data);
      console.log("target: " + message.target);
      console.log("objects: " + message.objects);
   
*/

  var elements = content.document.getElementsByTagName(message.data);
  for (var i = 0; i < elements.length; i++) { 
    var element = elements[i];
    sendAsyncMessage("element", element.outerHTML, {link : element});
  }
}