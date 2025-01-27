import React, { useState, useEffect, useRef } from "react";
import Peer from "simple-peer";
import styled from "styled-components";
import socket from "../../socket";
import VideoCard from "../Video/VideoCard";
import BottomBar from "../BottomBar/BottomBar";
import Chat from "../Chat/Chat";

const Room = (props) => {
  const generateRandomName = () => `User_${Math.floor(Math.random() * 10000)}`;
  const currentUser = sessionStorage.getItem("user") || generateRandomName();
  sessionStorage.setItem("user", currentUser);

  const [peers, setPeers] = useState([]);
  const [userVideoAudio, setUserVideoAudio] = useState({
    localUser: { video: true, audio: true },
  });
  const [displayChat, setDisplayChat] = useState(false);
  const [screenShare, setScreenShare] = useState(false);

  const peersRef = useRef([]);
  const userVideoRef = useRef();
  const screenTrackRef = useRef();
  const userStream = useRef();
  const roomId = props.match.params.roomId;

  useEffect(() => {
    const initMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        userVideoRef.current.srcObject = stream;
        userStream.current = stream;

        console.log('Media devices initialized successfully');
        socket.emit("BE-join-room", { roomId, userName: currentUser });

        socket.on("FE-user-join", (users) => {
          console.log("New users joined:", users);
          const peers = [];
          users.forEach(({ userId, info }) => {
            let { userName, video, audio } = info;
            if (userName !== currentUser) {
              const peer = createPeer(userId, socket.id, stream);

              peer.userName = userName;
              peer.peerID = userId;

              peersRef.current.push({
                peerID: userId,
                peer,
                userName,
              });
              peers.push(peer);

              setUserVideoAudio((preList) => ({
                ...preList,
                [peer.userName]: { video, audio },
              }));
            }
          });

          setPeers(peers);
        });

        socket.on('FE-receive-call', ({ signal, from, info }) => {
          console.log('Received call signal from:', from);
          let { userName, video, audio } = info;
          const peerIdx = findPeer(from);

          if (!peerIdx) {
            const peer = addPeer(signal, from, userStream.current);

            peer.userName = userName;

            peersRef.current.push({
              peerID: from,
              peer,
              userName: userName,
            });
            setPeers((users) => [...users, peer]);
            setUserVideoAudio((preList) => ({
              ...preList,
              [peer.userName]: { video, audio },
            }));
          }
        });

        socket.on('FE-call-accepted', ({ signal, answerId }) => {
          console.log('Received call acceptance signal from:', answerId);
          const peerIdx = findPeer(answerId);
          if (peerIdx) {
            peerIdx.peer.signal(signal);
          }
        });

        socket.on("FE-user-leave", ({ userId, userName }) => {
          console.log("User left:", userName);
          const peerIdx = findPeer(userId);
          if (peerIdx) {
            peerIdx.peer.destroy();
            setPeers((users) => users.filter((user) => user.peerID !== peerIdx.peer.peerID));
            peersRef.current = peersRef.current.filter(({ peerID }) => peerID !== userId);
          }
        });

        socket.on("FE-toggle-camera", ({ userId, switchTarget }) => {
          const peerIdx = findPeer(userId);

          setUserVideoAudio((preList) => {
            let video = preList[peerIdx.userName].video;
            let audio = preList[peerIdx.userName].audio;

            if (switchTarget === "video") video = !video;
            else audio = !audio;

            return {
              ...preList,
              [peerIdx.userName]: { video, audio },
            };
          });
        });
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    };

    initMedia();

    return () => {
      if (userStream.current) {
        userStream.current.getTracks().forEach((track) => track.stop());
        userStream.current = null;
      }

      if (userVideoRef.current) {
        userVideoRef.current.srcObject = null;
      }

      peersRef.current.forEach(({ peer }) => {
        peer.destroy();
      });

      socket.disconnect();
    };
  }, []);

  const createPeer = (userId, caller, stream) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
        ],
      },
    });

    peer.on("signal", (signal) => {
      console.log("Sending call signal to user:", userId);
      socket.emit("BE-call-user", {
        userToCall: userId,
        from: caller,
        signal,
      });
    });

    peer.on("stream", (remoteStream) => {
      console.log("Received remote stream from user:", userId);
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
    });

    return peer;
  };

  const addPeer = (incomingSignal, callerId, stream) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
        ],
      },
    });

    peer.on('signal', (signal) => {
      console.log('Sending answer signal to:', callerId);
      socket.emit('BE-accept-call', { signal, to: callerId });
    });

    peer.on('stream', (remoteStream) => {
      console.log('Received remote stream from:', callerId);
      setPeers((prevPeers) =>
        prevPeers.map((p) =>
          p.peerID === callerId ? { ...p, stream: remoteStream } : p
        )
      );
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
    });

    peer.signal(incomingSignal);

    return peer;
  };

  const findPeer = (id) => {
    return peersRef.current.find((p) => p.peerID === id);
  };

  const toggleCameraAudio = (e) => {
    const target = e.target.getAttribute("data-switch");

    if (userVideoRef.current && userVideoRef.current.srcObject) {
      const stream = userVideoRef.current.srcObject;
      const tracks = stream.getTracks();

      setUserVideoAudio((preList) => {
        let videoSwitch = preList["localUser"].video;
        let audioSwitch = preList["localUser"].audio;

        if (target === "video") {
          const videoTrack = tracks.find((track) => track.kind === "video");
          if (videoTrack) {
            videoSwitch = !videoSwitch;
            videoTrack.enabled = videoSwitch;
          }
        } else {
          const audioTrack = tracks.find((track) => track.kind === "audio");
          if (audioTrack) {
            audioSwitch = !audioSwitch;
            audioTrack.enabled = audioSwitch;
          }
        }

        return {
          ...preList,
          localUser: { video: videoSwitch, audio: audioSwitch },
        };
      });

      socket.emit("BE-toggle-camera-audio", { roomId, switchTarget: target });
    }
  };

  const clickScreenSharing = () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      alert("Your browser does not support screen sharing.");
      return;
    }

    if (!screenShare) {
      navigator.mediaDevices
        .getDisplayMedia({ video: true, cursor: true })
        .then((stream) => {
          const screenTrack = stream.getTracks()[0];

          peersRef.current.forEach(({ peer }) => {
            const videoTrack = peer.streams[0]
              .getTracks()
              .find((track) => track.kind === "video");

            if (videoTrack && screenTrack) {
              peer.replaceTrack(videoTrack, screenTrack, userStream.current);
            }
          });

          screenTrack.onended = () => {
            peersRef.current.forEach(({ peer }) => {
              const videoTrack = peer.streams[0]
                .getTracks()
                .find((track) => track.kind === "video");

              if (videoTrack && screenTrack) {
                peer.replaceTrack(screenTrack, videoTrack, userStream.current);
              }
            });
            userVideoRef.current.srcObject = userStream.current;
            setScreenShare(false);
          };

          userVideoRef.current.srcObject = stream;
          screenTrackRef.current = screenTrack;
          setScreenShare(true);
        })
        .catch((err) => {
          console.error("Error starting screen sharing: ", err);
          alert("Failed to start screen sharing.");
        });
    } else {
      if (screenTrackRef.current) {
        screenTrackRef.current.onended();
      }
    }
  };

  const goToBack = (e) => {
    e.preventDefault();

    if (userStream.current) {
      userStream.current.getTracks().forEach((track) => track.stop());
      userStream.current = null;
    }

    if (userVideoRef.current) {
      userVideoRef.current.srcObject = null;
    }

    peersRef.current.forEach(({ peer }) => {
      peer.destroy();
    });

    socket.emit("BE-leave-room", { roomId, leaver: currentUser });
    sessionStorage.removeItem("user");
    window.location.href = "/";
  };

  const clickChat = (e) => {
    e.stopPropagation();
    setDisplayChat(!displayChat);
  };

  const copyURL = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href)
        .then(() => {
          alert("URL copied to clipboard!");
        })
        .catch((err) => {
          console.error("Failed to copy URL: ", err);
          alert("Failed to copy URL. Please copy it manually.");
        });
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        alert("URL copied to clipboard!");
      } catch (err) {
        console.error("Failed to copy URL: ", err);
        alert("Failed to copy URL. Please copy it manually.");
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <RoomContainer>
      <MainVideoContainer displayChat={displayChat}>
        <VideoBox numPeers={peers.length + 1}>
          {userVideoAudio["localUser"].video ? null : (
            <UserName>{currentUser}</UserName>
          )}
          <MyVideo
            ref={userVideoRef}
            muted
            autoPlay
            playsInline
          />
        </VideoBox>
        {peers.map((peer, index) => (
          <VideoBox key={index} numPeers={peers.length + 1}>
            <VideoCard
              peer={peer}
              number={peers.length}
              video={userVideoAudio[peer.userName]?.video}
              audio={userVideoAudio[peer.userName]?.audio}
            />
            <UserName>{peer.userName}</UserName>
          </VideoBox>
        ))}
        {peers.length === 0 && (
          <SingleUserBlock>
            <CopyButton onClick={copyURL}>Copy URL</CopyButton>
          </SingleUserBlock>
        )}
      </MainVideoContainer>
      <BottomBar
        clickScreenSharing={clickScreenSharing}
        clickChat={clickChat}
        goToBack={goToBack}
        toggleCameraAudio={toggleCameraAudio}
        userVideoAudio={userVideoAudio["localUser"]}
        screenShare={screenShare}
      />
      <Chat display={displayChat} roomId={roomId} />
    </RoomContainer>
  );
};

const RoomContainer = styled.div`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const MainVideoContainer = styled.div`
  position: relative;
  flex: 1;
  display: grid;
  gap: 10px;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  width: ${({ displayChat }) => (displayChat ? "calc(100% - 300px)" : "100%")};
  transition: width 0.3s ease-in-out;
  grid-template-columns: repeat(auto-fit, minmax(755px, 1fr));
  grid-auto-rows: minmax(350px, auto);
  place-items: center;

  @media (max-width: 1920px) {
    grid-template-columns: repeat(auto-fit, minmax(755px, 1fr));
    grid-auto-rows: minmax(350px, auto);
  }

  @media (max-width: 1280px) {
    grid-template-columns: repeat(auto-fit, minmax(700px, 1fr));
    grid-auto-rows: minmax(169px, auto);
  }

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    grid-auto-rows: auto;
  }
`;

const VideoBox = styled.div`
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  > video {
    width: ${({ numPeers }) => (numPeers <= 4 ? "755px" : "calc(100% / 3)")};
    height: ${({ numPeers }) => (numPeers <= 4 ? "350px" : "auto")};
    border-radius: 10px;
    object-fit: cover;
  }
`;

const SingleUserBlock = styled.div`
  position: relative;
  width: 755px;
  height: 350px;
  background-color: black;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  z-index: 10;
  color: white;
`;

const CopyButton = styled.button`
  background-color: #007bff;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  font-size: 16px;
  cursor: pointer;

  &:hover {
    background-color: #0056b3;
  }
`;

const UserName = styled.div`
  position: absolute;
  left: 10px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 3px 5px;
  border-radius: 3px;
  z-index: 1;
  font-size: 14px;
  bottom: 10px;
`;

const MyVideo = styled.video``;

export default Room;