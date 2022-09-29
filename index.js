require("dotenv").config();
const ytdl = require("ytdl-core"),
  ffmpeg = require("fluent-ffmpeg"),
  nodeHtmlToImage = require("node-html-to-image"),
  fs = require("fs"),
  { Telegraf } = require("telegraf"),
  bot = new Telegraf(process.env.TG_TOKEN);

var song_data = {
  title: null,
  author: null,
  time: null,
  cover: null,
  currentTime: null,
};

var log_msg = {
  chat_id: null,
  message_id: null,
};

var chat_id;

var times = {
  start_time: 5,
  fadeTime: 6
}

function download_audio(url) {
  var stream = ytdl(url, {
    quality: "highestaudio",
    filter: "audioonly",
  })
    .on("error", (err) => {
      log('Error')
      console.log(err);
    })
    .on("info", (info) => {
      song_data.title = info.videoDetails.title;
      song_data.author = info.videoDetails.author.name.replace(" - Topic", "");
      song_data.cover = info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url;
      var temp = info.videoDetails.lengthSeconds;
      var min = parseInt(temp / 60);
      var sec = temp % 60;

      if (sec.toString().length == 0) {
        sec = "00";
      } else if (sec.toString().length == 1) {
        sec = "0" + sec;
      }
      song_data.time = min + ":" + sec;

      var temp = times.start_time - times.fadeTime;
      var min = parseInt(temp / 60);
      var sec = temp % 60;

      if (sec.toString().length == 0) {
        sec = "00";
      } else if (sec.toString().length == 1) {
        sec = "0" + sec;
      }
      song_data.currentTime = min + ":" + sec;

      ffmpeg(stream)
        .audioBitrate(320)
        .save("temp/audio.mp3")
        .on("error", (err) => {
          log('Error')
          console.log(err);
        })
        .on("end", () => {
          log("Audio download complete!");
          generate_image();
        });
    });
}

function generate_image() {
  fs.readFile("static/index.html", "utf8", (err, data) => {
    if (err) {
      log('Error')
      console.error(err);
    } else {
      data = data.replace("cover_key", song_data.cover);
      data = data.replace("artist_key", song_data.author);
      data = data.replace("track_key", song_data.title);
      data = data.replace("duration_key", song_data.time);
      data = data.replace("currentTime_key", song_data.currentTime);
      nodeHtmlToImage({
        output: "./temp/image.png",
        html: data,
      }).then(() => {
        log("The image was created successfully!");
        create_loop();
      });
    }
  });
}

function create_loop() {
  ffmpeg("temp/image.png")
    .loop(30)
    .output("temp/loop.mov")
    .on("error", (error) => {
      log('Error')
      console.log(error);
    })
    .on("end", () => {
      log("Loop created");
      cutt_audio();
    })
    .run();
}

function cutt_audio() {
  ffmpeg("temp/audio.mp3")
    .audioBitrate(320)
    .output("temp/cut.mp3")
    .outputOptions([`-ss ${times.start_time - times.fadeTime}`, "-t 30"])
    .on("error", (error) => {
      log('Error')
      console.log(error);
    })
    .on("end", () => {
      log("Audio cutted");
      add_audio_fade();
    })

    .run();
}

function add_audio_fade() {
  ffmpeg("temp/cut.mp3")
    .audioBitrate(320)
    .output("temp/fade.mp3")
    .audioFilters([
      {
        filter: "afade",
        options: `t=in:st=0:d=${times.fadeTime}`,
      },
    ])
    .on("error", (error) => {
      log('Error')
      console.log(error);
    })
    .on("end", () => {
      log("Audio fade added");
      generate_video();
    })
    .run();
}

function generate_video() {
  ffmpeg("temp/loop.mov")
    .input("static/guy.mov")
    .output("temp/out_noaudio.mp4")
    .complexFilter([
      {
        filter: "overlay",
        inputs: "0:0",
        outputs: "[out]",
      },
    ])
    .outputOptions([
      "-shortest",
      "-map [out]",
      "-pix_fmt yuv420p",
      "-c:a copy",
      "-c:v libx264",
      "-crf 18",
    ])
    .on("error", (error) => {
      log('Error')
      console.log(error);
    })
    .on("end", () => {
      log("Video overlay added!");
      combine_audio();
    })
    .run();
}

function combine_audio() {
  ffmpeg("temp/fade.mp3")
    .audioBitrate(320)
    .input("static/tunes.mp3")
    .output("temp/final.mp3")
    .complexFilter({
      filter: "amerge",
      options: { inputs: 2 },
    })
    .outputOptions(["-ac 2"])
    .on("error", (error) => {
      log('Error')
      console.log(error);
    })
    .on("end", () => {
      log("Combine audio");
      add_audio();
    })
    .run();
}

function add_audio() {
  ffmpeg("temp/out_noaudio.mp4")
    .audioBitrate(320)
    .input("temp/final.mp3")
    .output("final.mp4")
    .outputOptions(["-c copy", "-map 0:v:0", "-map 1:a:0"])
    .on("error", (error) => {
      log('Error')
      console.log(error);
    })
    .on("end", () => {
      log("Complete");
      bot.telegram
      .sendDocument(
        chat_id,
        { source: 'final.mp4' },
        {
          caption: `${song_data.title} - ${song_data.author}`,
        }
      )
    })
    .run();
}


function log(text) {
  console.log(text)
  bot.telegram.editMessageText(
    log_msg.chat_id,
    log_msg.message_id,
    null,
    text
  );
}

bot.on("text", (ctx) => {
  if (ctx.chat.id != '460266962') return;
  chat_id = ctx.chat.id
  var msg = ctx.message.text.split(" ");
  var time = msg[0];
  var url = msg[1];
  if (url && url.includes("youtube.com")) {
    times.start_time = time;
    download_audio(url);
    bot.telegram.sendMessage(ctx.chat.id, "Start").then((msg) => {
      log_msg.chat_id = msg.chat.id;
      log_msg.message_id = msg.message_id;
    });
  }else{
    ctx.reply('URL not found')
  }
  ctx.deleteMessage()
});




bot.launch();
