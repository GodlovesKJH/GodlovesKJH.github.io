/* 상담기록 앱 체험판 — 처음 열 때 가상의 학급과 기록을 채워 둔다 (실제 학생 정보 아님) */
(function () {
  try { if (localStorage.getItem('app_config')) return; } catch (e) { return; }
  function day(dd) { var d = new Date(); d.setDate(d.getDate() + dd);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var sem = new Date().getMonth() < 6 ? '1학기' : '2학기', now = new Date().toISOString();
  var names = ['김가람', '이나래', '박다온', '최라온', '정마루', '한바다'];
  var students = names.map(function (n, i) {
    return { id: 'demo-s' + (i + 1), name: n, gender: i % 2 ? '여' : '남', grade: '5', classNum: '1', number: String(i + 1),
      semester: sem, memo: '', createdAt: now, profile: '' };
  });
  function r(i, stu, type, summary, content, tags, dd) {
    return { id: 'demo-r' + i, studentName: stu, type: type, summary: summary, content: content, tags: tags,
      date: day(dd), semester: sem, raw: content, createdAt: now };
  }
  var records = [
    r(1, '김가람', '관찰', '모둠 활동에서 의견 조율을 주도함', '김가람은 과학 모둠 활동에서 친구들의 의견을 하나씩 정리해 발표 순서를 정했다.', '협력,리더십', -1),
    r(2, '이나래', '상담', '쉬는 시간 친구 관계 고민', '이나래와 점심시간에 이야기함. 요즘 쉬는 시간에 함께 놀 친구가 줄었다고 함. 다음 주에 다시 이야기하기로 함.', '교우관계', -2),
    r(3, '박다온', '학부모상담', '가정 독서 습관 상담', '박다온 어머니와 전화 상담. 집에서 책 읽는 시간을 늘리고 싶다고 하셔서 학급 독서 기록장을 함께 쓰기로 함.', '학습,독서', -3),
    r(4, '최라온', '특이사항', '체험학습 준비물 누락', '최라온이 체험학습 준비물을 챙기지 못함. 여분 준비물로 대체함.', '생활', -4),
    r(5, '정마루', '관찰', '수학 문제 풀이 설명이 뛰어남', '정마루는 분수 나눗셈 풀이 과정을 칠판에 나와 친구들에게 차근차근 설명했다.', '학습,발표', -5),
    r(6, '한바다', '상담', '진로 관심 이야기', '한바다가 동물 관련 직업에 관심이 많다고 함. 수의사와 사육사의 하는 일을 함께 찾아보기로 함.', '진로', -6),
    r(7, '이나래', '관찰', '친구에게 먼저 다가감', '이나래가 오늘 새로 전학 온 친구에게 먼저 다가가 학교 안내를 해 주었다.', '교우관계,배려', 0),
  ];
  try {
    localStorage.setItem('app_config', JSON.stringify({ grade: '5', classNum: '1' }));
    localStorage.setItem('app_students', JSON.stringify(students));
    localStorage.setItem('app_records', JSON.stringify(records));
  } catch (e) {}
})();
