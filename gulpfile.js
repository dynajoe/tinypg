var gulp = require('gulp');
var mocha = require('gulp-mocha');
var notifierReporter = require('mocha-notifier-reporter');

function test() {
   process.env.NODE_ENV = 'test'

   return gulp.src(['test/*.js'], { read: false })
   .pipe(mocha({
      reporter: notifierReporter.decorate('spec')
   }));
}

gulp.task('test', function() {
   return test();
});

gulp.task('watch', function () {
   gulp.watch(['src/**/*.js', 'test/**/*.js'], ['test']);
});