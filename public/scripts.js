$("document").ready(function(){
      $(".course").click(function(){
        const courseId=$(this).data('id');
        const courseName=$(this).data('name');
        const courseType=$(this).data('type');
        const cabinet=$(this).data('cabinet');
        const professor=$(this).data('professor');
        const weekday=$(this).data('weekday');
        const week=$(this).data('week');
        const time=$(this).data('time');
        const classroom=$(this).data('classroom');
        const students=$(this).data('students');
        const currentMarks=$(this).data('marks');
        const works=$(this).data('works');
        const other=$(this).data('other');

        $("#courseId").val(courseId);
        $("#courseName").val(courseName);
        switch(courseType){
            case "Lab":
                $("#Lab").prop("checked",true);
                break;
            case "Lecture":
                $("#Lecture").prop("checked",true);
                break;
        }
        $("#cabinet").val(cabinet);
        $("#professor").val(professor);
        switch(weekday){
            case "Monday":
                $("#Monday").prop("checked",true);
                break;
            case "Tuesday":
                $("#Tuesday").prop("checked",true);
                break;
            case "Wednesday":
                $("#Wednesday").prop("checked",true);
                break;
            case "Thursday":
                $("#Thursday").prop("checked",true);
                break;
            case "Friday":
                $("#Friday").prop("checked",true);
                break;
        }
        switch(week){
            case 1:
                $("#weekFirst").prop("checked",true);
                break;
            case 2:
                $("#weekSecond").prop("checked",true);
                break;
        }
        switch(time){
            case "8:00-9:35":
                $("#time1").prop("checked",true);
                break;
            case "9:50-11:25":
                $("#time2").prop("checked",true);
                break;
            case "11:40-13:15":
                $("#time3").prop("checked",true);
                break;
            case "13:30-15:05":
                $("#time4").prop("checked",true);
                break;
            case "15:20-16:55":
                $("#time5").prop("checked",true);
                break;
            case "17:10-18:45":
                $("#time6").prop("checked",true);
                break;
            case "19:00-20:35":
                $("#time7").prop("checked",true);
                break;
        }
        $("#classroom").val(classroom);
        $("#students").val(students);
        $("#currentMarks").val(currentMarks);
        $("#works").val(works);
        $("#other").val(other);
        console.log("You've clicked on "+$(this).data("marks"));
        });  
    });
    
    $("#cancelDelete").click(function(){
        $("#deleteDialog").hide();
    })

    $(".course").on("dblclick", function(){
      const id= $(this).data('id');
        const name= $(this).data('name');
        $("#id-field-delete").val(id);
         $("#modalMessage").html(`Are you sure you want to delete this course: "${name}"?`);
         console.log("You've clicked on "+id);
         $("#deleteDialog").show();
  }); 

  $(".scheduled-courses").click(function(){
        const courseName=$(this).data('name');
        const courseType=$(this).data('type');
        const cabinet=$(this).data('cabinet');
        const professor=$(this).data('professor');
        const weekday=$(this).data('weekday');
        const week=$(this).data('week');
        const time=$(this).data('time');
        const classroom=$(this).data('classroom');
        const students=$(this).data('students');
        const currentMarks=$(this).data('marks');
        const works=$(this).data('works');
        const other=$(this).data('other');

        $("#name").html(courseName);
        $("#type").html(courseType);
        $("#cabinet").html(cabinet);
        $("#professor").html(professor);
        $("#weekday").html(weekday);
        $("#week").html(week);
        $("#time").html(time);
        $("#classroom").html(classroom);
        $("#students").html(students);
        $("#currentMarks").html(currentMarks);
        $("#works").html(works);
        $("#other").html(other);
        $("#dialog-info").show();
  });

  $("#dialog-info-close").click(function(){
        $("#dialog-info").hide();
    })

    $("#close-alert").click(function(){
        $("#already-got").hide();
    })