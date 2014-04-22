addEventListener("click", function (event) {
  sendAsyncMessage("my-e10s-extension-message", {
      details : "they clicked",
      tag : event.target.tagName
    }, 
    {
      element : event.target
    });
}, false);

