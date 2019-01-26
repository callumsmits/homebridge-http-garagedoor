# homebridge-http-garagedoor

Simple homebridge plugin to interface to an http interface to a garage door


## Example config
```json
{
  "bridge": {
      "name": "Homebridge",
      "username": "12:34:56:78:AB:CD",
      "port": 11000,
      "pin": "123-45-678"
  },
  "platforms": [
  ],
  "accessories": [
       {
           "accessory": "HttpGarageDoor",
           "name": "Garage Door",
           "host": "garage.local",
           "sensorPollInMs": 4000,
           "doorOpensInSeconds": 21
       }
   ]
}
```
