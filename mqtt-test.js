Colors = new Meteor.Collection("mqtt_colors");
Colors.before.insert(function (userId, doc) {
  doc.createdAt = new Date();
});

Router.configure({
  layoutTemplate: 'ApplicationLayout'
});

Router.route('/', function () {
  this.render('Home')
});

Router.route('/feed', { 
  waitOn: function () {
    console.log("waitOn");
    return Meteor.subscribe('mqttColors');
  },
  data: function () {
    return Colors.find({});
  },
  action: function () {
    this.render('Feed');
  }
});

if (Meteor.isClient) {

  var sendColor = function (arg) {
    var color = "#"+$.colpick.hsbToHex(arg);
    console.log("color", color);
    Meteor.call('add_color', color, function(err, response) {
      console.log("err: " +err + " response: " + response);
    });
  }
  // counter starts at 0
  Session.setDefault('counter', 0);

  Template.ApplicationLayout.helpers({
    activeIfTemplateIs: function(template) {
      var currentRoute;
      currentRoute = Router.current();
      if (currentRoute && template === currentRoute.lookupTemplate()) {
        return "active";
      } else {
        return "";
      }
    }
  });

  Template.hello.helpers({
    counter: function () {
      return Session.get('counter');
    }
  });

  Template.colorpicker.rendered = function () {
    $('#picker').colpick({
      flat:true,
      layout:'hex',
      submit:true,
      submitText: "GO",
      onSubmit: sendColor
    })
  };

  Template.feed.helpers({
    colors: function () {
      return Template.instance().data;
    }
  });

  var sendColorInterval;
  var sendColorMessage = function(colors) {
    console.log(colors.fetch()[0]);

    if (colors.fetch().length > 0) {
      var thisColor = colors.fetch()[0];
      Meteor.call('publish_message', "myTopic", thisColor.hex,  function(err, response) {
        console.log("err: " +err + " response: " + response);
        if (!err) {
          Colors.remove({_id:thisColor._id});
        }
      }); 
    }
  }

  Template.feed.created = function () {
    colors = this.data
    sendColorInterval = Meteor.setInterval(function() {
      sendColorMessage(colors);
    }, 5000);
  }
}

if (Meteor.isServer) {
  Meteor.startup(function () {
    ServiceConfiguration.configurations.remove({
        service: 'twitter'
    });
     
    ServiceConfiguration.configurations.insert({
        service: 'twitter',
        consumerKey: process.env.TWITTER_CONSUMER_KEY,
        secret: process.env.TWITTER_SECRET
    });
  });

  config = {
    mqttHost: process.env.MQTTHost,
    mqttPort: 1883
  };
  // initialize the mqtt client from mqtt npm-package
  var mqtt = Meteor.npmRequire("mqtt");
  var client = mqtt.connect(config.mqttHost);
  client
    .on("connect", function() {
        console.log("client connected");
        client.subscribe('myTopic')
    })
    .on("message", function(topic, message) {
        console.log(topic + ": " + message);
    });

  Meteor.publish("mqttColors", function() {
    return Colors.find({}, {sort: {createdAt: -1}, limit: 50});
  });

  Meteor.publish("user_data", function() {
    if (this.userId) {
      return Meteor.users.find({
        _id: this.userId
      }, {
        fields: {
          'services.twitter.profile_image_url': 1,
          'services.twitter.screenName': 1,
        }
      });
    } else {
      return this.ready();
    }
  });


  Meteor.methods({
    topic_subscribe: function(topic) {
        client.subscribe(topic);
    },
    topic_unsubscribe: function(topic) {
        client.unsubscribe(topic);
    },
    publish_message: function(topic, message) {
        client.publish(topic, message, function() {
            console.log("message sent: " + message);
        });
    },
    add_color: function(color) {
      color = {
        "hex": color,
        "user_id": this.userId
      }
      Colors.insert(color);  
    }
  });
}
